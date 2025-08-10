import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createNft, burnV1, TokenStandard, transferV1 } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, percentAmount, generateSigner, publicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";
import { mockStorage } from "@metaplex-foundation/umi-storage-mock";
import dotenv from "dotenv";
import Moralis from 'moralis';

dotenv.config();

const solanaRpcUrl = process.env.SOLANA_RPC_PROVIDER;
const umi = createUmi(solanaRpcUrl || "https://api.mainnet-beta.solana.com");
const adminPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATEKEY;

const pinataApiKey = process.env.PINATA_API_KEY;
const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;
const moralisApiKey = process.env.MORALIS_API_KEY;

// Test function to verify Pinata configuration
export async function testPinataSetup(): Promise<{ success: boolean; message: string }> {
    try {
        if (!pinataApiKey || !pinataSecretApiKey) {
            return {
                success: false,
                message: 'Pinata API keys not found in environment variables. Please set PINATA_API_KEY and PINATA_SECRET_API_KEY in .env file'
            };
        }

        console.log('🔍 Testing Pinata setup...');
        console.log('🔑 API Key:', pinataApiKey.substring(0, 8) + '...');
        console.log('🔑 Secret Key:', pinataSecretApiKey.substring(0, 8) + '...');

        const res = await fetch("https://api.pinata.cloud/data/testAuthentication", {
            method: 'GET',
            headers: {
                'pinata_api_key': pinataApiKey,
                'pinata_secret_api_key': pinataSecretApiKey
            }
        });

        const responseText = await res.text();
        
        if (res.ok) {
            return {
                success: true,
                message: `Pinata API connection successful. Response: ${responseText}`
            };
        } else {
            return {
                success: false,
                message: `Pinata API authentication failed. Status: ${res.status}, Response: ${responseText}`
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `Pinata connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

// Initialize UMI with admin wallet for minting operations
console.log("🥇🥇🥇", adminPrivateKey);
if (adminPrivateKey) {
    try {
        let secretKey: Uint8Array;
        
        // Handle different private key formats
        if (adminPrivateKey.length === 128) {
            // Hex format (64 bytes as hex string = 128 characters)
            secretKey = new Uint8Array(Buffer.from(adminPrivateKey, 'hex'));
        } else if (adminPrivateKey.includes('[') && adminPrivateKey.includes(']')) {
            // Array format: [38,201,102,...]
            const arrayString = adminPrivateKey.replace(/[\[\]\s]/g, '');
            const numberArray = arrayString.split(',').map(num => parseInt(num.trim()));
            secretKey = new Uint8Array(numberArray);
        } else if (adminPrivateKey.length >= 85 && adminPrivateKey.length <= 90) {
            // This length range covers both Base58 and Base64 formats
            // Try base58 first (most common for Solana - Phantom wallet format)
            try {
                secretKey = bs58.decode(adminPrivateKey);
                console.log('✅ Successfully decoded Base58 private key');
            } catch (bs58Error) {
                console.log('❌ Base58 decode failed, trying Base64...');
                try {
                    // Base64 format (64 bytes as base64 = ~88 characters, but can vary)
                    const decoded = Buffer.from(adminPrivateKey, 'base64');
                    // Take only the first 64 bytes (some exports include extra data)
                    secretKey = new Uint8Array(decoded.slice(0, 64));
                    console.log('✅ Successfully decoded Base64 private key');
                } catch (base64Error) {
                    throw new Error('Invalid private key format. Expected base58 or base64 format for this length');
                }
            }
        } else {
            // Try other formats for different lengths
            try {
                // Try base58 format (works for various lengths)
                secretKey = bs58.decode(adminPrivateKey);
                console.log('✅ Successfully decoded Base58 private key');
            } catch (bs58Error) {
                // Try parsing as comma-separated numbers
                const numbers = adminPrivateKey.split(',').map(n => parseInt(n.trim()));
                if (numbers.length === 64 && numbers.every(n => !isNaN(n))) {
                    secretKey = new Uint8Array(numbers);
                    console.log('✅ Successfully parsed comma-separated numbers private key');
                } else {
                    throw new Error('Invalid private key format. Expected base58, base64, hex, or array format');
                }
            }
        }
        
        // Validate secret key length
        if (secretKey.length !== 64) {
            throw new Error(`Invalid secret key length: ${secretKey.length} bytes. Expected 64 bytes.`);
        }
        
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
        umi.use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(mockStorage());
        
        console.log('✅ Admin wallet initialized for NFT minting:', umiKeypair.publicKey.toString());
    } catch (error) {
        console.error('❌ Failed to initialize admin wallet:', error);
        console.error('Private key format should be one of:');
        console.error('  • Base58 (87-88 chars): 5Kw7p...');
        console.error('  • Base64 (88 chars): eWmv2u...');
        console.error('  • Hex (128 chars): 1f2e3d...');
        console.error('  • Array: [38,201,102,...]');
        console.error('Make sure SOLANA_WALLET_PRIVATEKEY is correctly set in .env file');
    }
}

export interface NFTMetadata {
    name: string;
    description: string;
    symbol: string;
    image: string;
    attributes?: Array<{
        trait_type: string;
        value: string | number;
    }>;
    // Event-specific metadata
    eventId?: string;
    eventName?: string;
    eventDate?: string;
    venue?: string;
    category?: 'VIP' | 'Standard' | 'Group';
    seatNumber?: string;
    price?: number;
}

export interface UserNFT {
    mint: string;
    name: string;
    description: string;
    image: string;
    attributes: Array<{
        trait_type: string;
        value: string | number;
    }>;
    isEventTicket?: boolean;
    eventDetails?: {
        eventId: string;
        eventName: string;
        category: string;
        isUsed: boolean;
    };
}

// Create wallet function from your code
export const createWallet = async () => {
    const wallet = generateSigner(umi);
    return { publicKey: wallet.publicKey.toString(), privateKey: bs58.encode(wallet.secretKey) };
}

// Upload image to Pinata IPFS
export async function uploadImageToPinata(imageBuffer: Buffer, fileName: string): Promise<string> {
    try {
        if (!pinataApiKey || !pinataSecretApiKey) {
            throw new Error('Pinata API keys not configured. Please set PINATA_API_KEY and PINATA_SECRET_API_KEY in .env file');
        }

        console.log('📤 Starting image upload to Pinata IPFS...');
        console.log('📁 File name:', fileName);
        console.log('📏 File size:', imageBuffer.length, 'bytes');
        console.log('🔑 API Key length:', pinataApiKey.length);

        // First test API connectivity
        const isApiWorking = await testPinataConnection(pinataApiKey, pinataSecretApiKey);
        if (!isApiWorking) {
            throw new Error('Pinata API connection failed. Please check your API keys.');
        }

        // Try multiple upload strategies
        const strategies = [
            () => attemptNodeFetchUpload(imageBuffer, fileName, pinataApiKey, pinataSecretApiKey),
            () => attemptSimpleUpload(imageBuffer, fileName, pinataApiKey, pinataSecretApiKey),
            () => attemptBasicUpload(imageBuffer, fileName, pinataApiKey, pinataSecretApiKey)
        ];

        for (const [index, strategy] of strategies.entries()) {
            try {
                console.log(`🔄 Trying upload strategy ${index + 1}...`);
                const result = await strategy();
                if (result) {
                    console.log(`✅ Strategy ${index + 1} successful: ${result}`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ Strategy ${index + 1} failed:`, error instanceof Error ? error.message : error);
            }
        }

        throw new Error('All upload strategies failed');

    } catch (error) {
        console.error("ERROR------> Image upload failed:", error);
        throw new Error(`Failed to upload image to IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Test Pinata API connection
async function testPinataConnection(apiKey: string, secretKey: string): Promise<boolean> {
    try {
        console.log('🔍 Testing Pinata API connection...');
        const res = await fetch("https://api.pinata.cloud/data/testAuthentication", {
            method: 'GET',
            headers: {
                'pinata_api_key': apiKey,
                'pinata_secret_api_key': secretKey
            }
        });

        const responseText = await res.text();
        console.log('🔐 Auth test response:', res.status, responseText);
        
        if (res.ok) {
            console.log('✅ Pinata API connection successful');
            return true;
        } else {
            console.log('❌ Pinata API authentication failed');
            return false;
        }
    } catch (error) {
        console.log('❌ Pinata API connection error:', error);
        return false;
    }
}

// Strategy 1: Using node-fetch with manual FormData construction
async function attemptNodeFetchUpload(imageBuffer: Buffer, fileName: string, apiKey: string, secretKey: string): Promise<string | null> {
    try {
        console.log('🔄 Attempting node-fetch upload...');
        
        // Create boundary manually
        const boundary = '----formdata-boundary-' + Math.random().toString(36);
        
        // Construct multipart body manually
        const chunks: Buffer[] = [];
        
        // Add file field
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
        chunks.push(Buffer.from(`Content-Type: image/jpeg\r\n\r\n`));
        chunks.push(imageBuffer);
        chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        
        const body = Buffer.concat(chunks);

        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: 'POST',
            headers: {
                'pinata_api_key': apiKey,
                'pinata_secret_api_key': secretKey,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length.toString()
            },
            body: body
        });

        const responseText = await res.text();
        console.log('📥 Node-fetch upload response:', res.status, responseText);
        
        if (res.ok) {
            const data = JSON.parse(responseText);
            if (data.IpfsHash) {
                const imageUrl = `https://ipfs.io/ipfs/${data.IpfsHash}`;
                return imageUrl;
            }
        }
        
        return null;
    } catch (error) {
        console.log('❌ Node-fetch upload error:', error);
        return null;
    }
}

// Simple upload attempt - just the file
async function attemptSimpleUpload(imageBuffer: Buffer, fileName: string, apiKey: string, secretKey: string): Promise<string | null> {
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        
        // Just append the file with minimal options
        formData.append('file', imageBuffer, fileName);

        console.log('🔄 Attempting simple upload...');

        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: 'POST',
            headers: {
                'pinata_api_key': apiKey,
                'pinata_secret_api_key': secretKey,
                ...formData.getHeaders()
            },
            body: formData
        });

        const responseText = await res.text();
        console.log('📥 Simple upload response status:', res.status);
        
        if (res.ok) {
            const data = JSON.parse(responseText);
            if (data.IpfsHash) {
                const imageUrl = `https://ipfs.io/ipfs/${data.IpfsHash}`;
                console.log(`✅ Simple upload successful: ${imageUrl}`);
                return imageUrl;
            }
        } else {
            console.log('📥 Simple upload failed:', responseText);
        }
        
        return null;
    } catch (error) {
        console.log('❌ Simple upload error:', error);
        return null;
    }
}

// Basic upload with proper structure
async function attemptBasicUpload(imageBuffer: Buffer, fileName: string, apiKey: string, secretKey: string): Promise<string> {
    const FormData = require('form-data');
    const formData = new FormData();
    
    // Determine content type based on file extension
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const contentTypeMap: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    const contentType = contentTypeMap[fileExtension] || 'image/jpeg';

    // Append the file with proper structure
    formData.append('file', imageBuffer, {
        filename: fileName,
        contentType: contentType
    });

    console.log('🔄 Attempting basic upload with metadata...');

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: 'POST',
        headers: {
            'pinata_api_key': apiKey,
            'pinata_secret_api_key': secretKey,
            ...formData.getHeaders()
        },
        body: formData
    });

    const responseText = await res.text();
    console.log('📥 Basic upload response status:', res.status);
    console.log('📥 Basic upload response:', responseText);

    if (!res.ok) {
        throw new Error(`Pinata upload failed: ${res.status} ${responseText}`);
    }

    const data = JSON.parse(responseText);
    if (!data.IpfsHash) {
        throw new Error('No IPFS hash returned from Pinata');
    }

    const imageUrl = `https://ipfs.io/ipfs/${data.IpfsHash}`;
    console.log(`✅ Basic upload successful: ${imageUrl}`);
    return imageUrl;
}

// Upload metadata to Pinata (from your code)
async function uploadMetadataToPinata(metadata: any): Promise<string> {
    try {
        const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'pinata_api_key': pinataApiKey || '',
                'pinata_secret_api_key': pinataSecretApiKey || '',
            },
            body: JSON.stringify(metadata)
        });
        const data = await res.json();
        const ipfsHash = data.IpfsHash;
        return ipfsHash;
    } catch (error) {
        console.error("ERROR------> NFT metadata upload failed:", error);
        throw new Error("Failed to upload metadata to IPFS");
    }
}

// Mint NFT function (adapted from your code)
export const mintNFT = async (metadata: NFTMetadata): Promise<string> => {
    try {
        // Check if admin wallet is properly initialized
        if (!umi.identity || !adminPrivateKey) {
            throw new Error('Admin wallet not configured. Please set SOLANA_WALLET_PRIVATEKEY in .env file');
        }

        // Check admin wallet balance
        const balance = await umi.rpc.getBalance(umi.identity.publicKey);
        const balanceInSOL = Number(balance.basisPoints) / 1000000000;
        const requiredSOL = 0.02; // Approximate cost per NFT
        
        if (balanceInSOL < requiredSOL) {
            throw new Error(`Insufficient SOL balance. Have ${balanceInSOL.toFixed(6)} SOL, need at least ${requiredSOL} SOL. Fund wallet: ${umi.identity.publicKey.toString()}`);
        }
        
        console.log(`💰 Admin wallet balance: ${balanceInSOL.toFixed(6)} SOL`);
        
        const mint = generateSigner(umi);
        const minimalMetadata = {
            name: metadata.name,
            description: metadata.description,
            symbol: metadata.symbol,
            image: metadata.image,
            attributes: metadata.attributes || [],
            // Add event-specific attributes if this is an event ticket
            ...(metadata.eventId && {
                eventId: metadata.eventId,
                eventName: metadata.eventName,
                eventDate: metadata.eventDate,
                venue: metadata.venue,
                category: metadata.category,
                seatNumber: metadata.seatNumber,
                isUsed: false
            })
        };

        const metadataHash = await uploadMetadataToPinata(minimalMetadata);
        const metadataUrl = `https://ipfs.io/ipfs/${metadataHash}`;

        await createNft(umi, {
            mint,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadataUrl,
            sellerFeeBasisPoints: percentAmount(0),
            isMutable: true,
            creators: [{
                address: umi.identity.publicKey,
                verified: true,
                share: 100,
            }],
            collection: null,
            uses: null,
        }).sendAndConfirm(umi, {
            send: {
                commitment: "finalized",
                preflightCommitment: "confirmed"
            }
        });

        console.log("✅ NFT minted successfully!", mint.publicKey.toString());
        return mint.publicKey.toString();
    } catch (error: any) {
        console.error("ERROR------> NFT minting failed:", error);
        throw new Error(`Failed to mint NFT: ${error.message}`);
    }
}

// Burn NFT function (from your code)
export const burnNFT = async (privateKey: string, mintAddress: string): Promise<boolean> => {
    try {
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
        const tempUmi = createUmi(solanaRpcUrl || "https://api.mainnet-beta.solana.com");
        tempUmi.use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(mockStorage());

        if (!mintAddress) {
            throw new Error("Mint address is required");
        }

        const mint = publicKey(mintAddress);

        await burnV1(tempUmi, {
            mint,
            authority: tempUmi.identity,
            tokenStandard: TokenStandard.NonFungible,
        }).sendAndConfirm(tempUmi, {
            send: { commitment: "finalized" }
        });

        console.log("✅ NFT burned successfully!");
        return true;
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred while burning NFT";
        console.error("ERROR------> NFT burning failed:", errorMessage);
        throw new Error(errorMessage);
    }
};

// Transfer NFT to user (from your code, enhanced)
export const transferNFTToUser = async (mintAddress: string, toAddress: string, privateKey: string): Promise<boolean> => {
    try {
        console.log(`🔄 Starting NFT transfer: ${mintAddress} → ${toAddress}`);
        
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
        const tempUmi = createUmi(solanaRpcUrl || "https://api.mainnet-beta.solana.com");
        tempUmi.use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(mockStorage());

        const mint = publicKey(mintAddress);
        const to = publicKey(toAddress);

        console.log(`🔑 Admin wallet: ${tempUmi.identity.publicKey.toString()}`);
        console.log(`🎯 Destination: ${toAddress}`);

        // First, check if the NFT exists and is owned by admin
        try {
            const nftAccount = await tempUmi.rpc.getAccount(mint);
            if (!nftAccount.exists) {
                throw new Error(`NFT ${mintAddress} does not exist`);
            }
            console.log(`✅ NFT ${mintAddress} exists`);
        } catch (error) {
            console.error(`❌ Error checking NFT existence:`, error);
            throw new Error(`NFT ${mintAddress} not found or inaccessible`);
        }

        // Perform the transfer
        const transferResult = await transferV1(tempUmi, {
            mint,
            authority: tempUmi.identity,
            tokenOwner: tempUmi.identity.publicKey,
            destinationOwner: to,
            tokenStandard: TokenStandard.NonFungible,
        }).sendAndConfirm(tempUmi, {
            send: { commitment: "finalized" }
        });

        console.log(`✅ NFT transferred successfully! Transaction: ${transferResult.signature}`);
        return true;
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred while transferring NFT";
        console.error("❌ NFT transfer failed:", errorMessage);
        console.error("Full error:", error);
        return false;
    }
}

// Get user's NFTs using Moralis
export async function getUserNFTs(walletAddress: string): Promise<UserNFT[]> {
    try {
        if (!moralisApiKey) {
            throw new Error('MORALIS_API_KEY not configured');
        }

        await Moralis.start({ apiKey: moralisApiKey });
        
        const isTestnet = solanaRpcUrl?.includes('devnet') || solanaRpcUrl?.includes('testnet');
        const network = isTestnet ? "devnet" : "mainnet";

        console.log(`🔍 Fetching NFTs for wallet ${walletAddress} on ${network}`);

        const response = await Moralis.SolApi.account.getNFTs({
            address: walletAddress,
            network: network,
        });

        const nfts = response.toJSON();
        console.log(`🔍 Raw NFT response structure:`, JSON.stringify(nfts.slice(0, 1), null, 2)); // Log first NFT structure for debugging
        const userNFTs: UserNFT[] = [];

        for (const nft of nfts) {
            // Cast to any to handle different response structures
            const nftData = nft as any;
            try {
                
                // Fetch metadata from URI
                let metadata: any = {};
                let metadataUri = '';
                
                // Handle different response structures
                if (nftData.metadataUri) {
                    metadataUri = nftData.metadataUri;
                } else if (nftData.metadata?.metadataUri) {
                    metadataUri = nftData.metadata.metadataUri;
                }

                if (metadataUri) {
                    try {
                        const metadataResponse = await fetch(metadataUri);
                        if (metadataResponse.ok) {
                            metadata = await metadataResponse.json();
                        }
                    } catch (metadataError) {
                        console.warn(`Failed to fetch metadata for NFT ${nft.mint}:`, metadataError);
                    }
                }

                // Extract name and symbol from different possible locations
                let nftName = 'Unknown NFT';
                let nftSymbol = '';
                let nftDescription = '';

                if (metadata.name) {
                    nftName = metadata.name;
                } else if (nftData.name) {
                    nftName = nftData.name;
                }

                if (metadata.symbol) {
                    nftSymbol = metadata.symbol;
                } else if (nftData.symbol) {
                    nftSymbol = nftData.symbol;
                }

                if (metadata.description) {
                    nftDescription = metadata.description;
                }

                // Check if this is an event ticket - more reliable detection
                const isEventTicket = Boolean(
                    metadata.eventId || 
                    (metadata.attributes && metadata.attributes.some((attr: any) => 
                        attr.trait_type === 'Event' && attr.value
                    )) ||
                    (metadata.attributes && metadata.attributes.some((attr: any) => 
                        attr.trait_type === 'Used' && (attr.value === 'false' || attr.value === 'true')
                    )) ||
                    (metadata.category && ['VIP', 'Standard', 'Group'].includes(metadata.category)) ||
                    (nftName.toLowerCase().includes('ticket') && metadata.eventId)
                );

                const userNFT: UserNFT = {
                    mint: nftData.mint,
                    name: nftName,
                    description: nftDescription,
                    image: metadata.image || '',
                    attributes: metadata.attributes || [],
                    isEventTicket,
                    ...(isEventTicket && {
                        eventDetails: {
                            eventId: metadata.eventId || 'unknown',
                            eventName: metadata.eventName || metadata.name || nftName,
                            category: metadata.category || 'Standard',
                            isUsed: metadata.isUsed || false
                        }
                    })
                };

                userNFTs.push(userNFT);
            } catch (nftError) {
                console.warn(`Error processing NFT ${nftData.mint}:`, nftError);
                // Still add a basic NFT entry even if metadata fails
                userNFTs.push({
                    mint: nftData.mint,
                    name: nftData.name || nftData.symbol || 'Unknown NFT',
                    description: '',
                    image: '',
                    attributes: [],
                    isEventTicket: false
                });
            }
        }

        console.log(`📊 Found ${userNFTs.length} NFTs for wallet ${walletAddress}`);
        return userNFTs;
    } catch (error) {
        console.error('❌ Error fetching user NFTs:', error);
        throw new Error(`Failed to fetch NFTs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Get specific NFT metadata
export async function getNFTMetadata(mintAddress: string): Promise<UserNFT | null> {
    try {
        await Moralis.start({ apiKey: moralisApiKey });
        
        const isTestnet = solanaRpcUrl?.includes('devnet') || solanaRpcUrl?.includes('testnet');
        const network = isTestnet ? "devnet" : "mainnet";

        const response = await Moralis.SolApi.nft.getNFTMetadata({
            address: mintAddress,
            network: network,
        });

        const nft: any = response.toJSON();
        
        // Fetch metadata from URI
        let metadata: any = {};
        let metadataUri = '';
        
        // Handle different response structures
        if (nft.metadataUri) {
            metadataUri = nft.metadataUri;
        } else if (nft.metadata?.metadataUri) {
            metadataUri = nft.metadata.metadataUri;
        }

        if (metadataUri) {
            try {
                const metadataResponse = await fetch(metadataUri);
                if (metadataResponse.ok) {
                    metadata = await metadataResponse.json();
                }
            } catch (metadataError) {
                console.warn(`Failed to fetch metadata for NFT ${mintAddress}:`, metadataError);
            }
        }

        // Extract name and description from different possible locations
        let nftName = 'Unknown NFT';
        let nftDescription = '';

        if (metadata.name) {
            nftName = metadata.name;
        } else if (nft.name) {
            nftName = nft.name;
        }

        if (metadata.description) {
            nftDescription = metadata.description;
        }

        const isEventTicket = Boolean(
            metadata.eventId || 
            (metadata.attributes && metadata.attributes.some((attr: any) => 
                attr.trait_type === 'Event' && attr.value
            )) ||
            (metadata.attributes && metadata.attributes.some((attr: any) => 
                attr.trait_type === 'Used' && (attr.value === 'false' || attr.value === 'true')
            )) ||
            (metadata.category && ['VIP', 'Standard', 'Group'].includes(metadata.category)) ||
            (nftName.toLowerCase().includes('ticket') && metadata.eventId)
        );

        return {
            mint: mintAddress,
            name: nftName,
            description: nftDescription,
            image: metadata.image || '',
            attributes: metadata.attributes || [],
            isEventTicket,
            ...(isEventTicket && {
                eventDetails: {
                    eventId: metadata.eventId || 'unknown',
                    eventName: metadata.eventName || metadata.name || nftName,
                    category: metadata.category || 'Standard',
                    isUsed: metadata.isUsed || false
                }
            })
        };
    } catch (error) {
        console.error(`❌ Error fetching NFT metadata for ${mintAddress}:`, error);
        return null;
    }
}

// Validate NFT ownership
export async function validateNFTOwnership(walletAddress: string, mintAddress: string): Promise<boolean> {
    try {
        const userNFTs = await getUserNFTs(walletAddress);
        return userNFTs.some(nft => nft.mint === mintAddress);
    } catch (error) {
        console.error('❌ Error validating NFT ownership:', error);
        return false;
    }
}

// Event Ticket Creation Functions
export async function createEventTickets(eventData: {
    eventId: string;
    eventName: string;
    eventDate: string;
    venue: string;
    categories: Array<{
        category: 'VIP' | 'Standard' | 'Group';
        quantity: number;
        price: number;
        baseImageUrl: string;
    }>;
}): Promise<{ [category: string]: string[] }> {
    const results: { [category: string]: string[] } = {};
    
    for (const categoryData of eventData.categories) {
        results[categoryData.category] = [];
        
        for (let i = 1; i <= categoryData.quantity; i++) {
            try {
                const ticketMetadata: NFTMetadata = {
                    name: `${categoryData.category} Ticket - ${eventData.eventName}`,
                    description: `${categoryData.category} access to ${eventData.eventName} at ${eventData.venue}`,
                    symbol: 'TICKET',
                    image: categoryData.baseImageUrl,
                    eventId: eventData.eventId,
                    eventName: eventData.eventName,
                    eventDate: eventData.eventDate,
                    venue: eventData.venue,
                    category: categoryData.category,
                    seatNumber: `${categoryData.category}-${i.toString().padStart(3, '0')}`,
                    price: categoryData.price,
                    attributes: [
                        { trait_type: 'Event', value: eventData.eventName },
                        { trait_type: 'Category', value: categoryData.category },
                        { trait_type: 'Date', value: eventData.eventDate },
                        { trait_type: 'Venue', value: eventData.venue },
                        { trait_type: 'Seat', value: `${categoryData.category}-${i.toString().padStart(3, '0')}` },
                        { trait_type: 'Price', value: categoryData.price },
                        { trait_type: 'Used', value: 'false' }
                    ]
                };

                const mintAddress = await mintNFT(ticketMetadata);
                results[categoryData.category].push(mintAddress);
                
                console.log(`✅ Created ${categoryData.category} ticket ${i}/${categoryData.quantity}: ${mintAddress}`);
            } catch (error) {
                console.error(`❌ Failed to create ${categoryData.category} ticket ${i}:`, error);
            }
        }
    }
    
    return results;
}

// Mark ticket as used (by updating metadata - this would typically require additional smart contract logic)
export async function markTicketAsUsed(mintAddress: string, eventId: string): Promise<boolean> {
    try {
        console.log(`🎫 Marking ticket ${mintAddress} as used for event ${eventId}`);
        
        // In a production environment, you would:
        // 1. Update NFT metadata on-chain to mark as used
        // 2. Record in a database/smart contract
        // 3. Possibly transfer to a "used tickets" account
        
        // For now, we'll implement a basic tracking mechanism
        // This could be enhanced with a proper database or smart contract
        
        // You could also update the NFT metadata attributes to mark as used
        // const nftMetadata = await getNFTMetadata(mintAddress);
        // if (nftMetadata && nftMetadata.attributes) {
        //     const usedAttribute = nftMetadata.attributes.find(attr => attr.trait_type === 'Used');
        //     if (usedAttribute) {
        //         usedAttribute.value = 'true';
        //         // Update metadata on-chain here
        //     }
        // }
        
        return true;
    } catch (error) {
        console.error('❌ Error marking ticket as used:', error);
        return false;
    }
}

// Validate ticket for event entry
export async function validateTicketEntry(walletAddress: string, mintAddress: string, eventId: string): Promise<{
    isValid: boolean;
    isOwned: boolean;
    isUsed: boolean;
    ticketDetails?: UserNFT;
    error?: string;
}> {
    try {
        // Check if user owns the NFT
        const isOwned = await validateNFTOwnership(walletAddress, mintAddress);
        if (!isOwned) {
            return {
                isValid: false,
                isOwned: false,
                isUsed: false,
                error: 'Ticket not owned by this wallet'
            };
        }

        // Get NFT details
        const nftDetails = await getNFTMetadata(mintAddress);
        if (!nftDetails) {
            return {
                isValid: false,
                isOwned: true,
                isUsed: false,
                error: 'Could not fetch ticket details'
            };
        }

        // Check if it's an event ticket
        if (!nftDetails.isEventTicket) {
            return {
                isValid: false,
                isOwned: true,
                isUsed: false,
                error: 'NFT is not an event ticket'
            };
        }

        // Check if ticket is for the correct event
        if (nftDetails.eventDetails?.eventId !== eventId) {
            return {
                isValid: false,
                isOwned: true,
                isUsed: false,
                error: 'Ticket is not for this event'
            };
        }

        // Check if ticket is already used
        if (nftDetails.eventDetails?.isUsed) {
            return {
                isValid: false,
                isOwned: true,
                isUsed: true,
                ticketDetails: nftDetails,
                error: 'Ticket has already been used'
            };
        }

        return {
            isValid: true,
            isOwned: true,
            isUsed: false,
            ticketDetails: nftDetails
        };
    } catch (error) {
        console.error('❌ Error validating ticket entry:', error);
        return {
            isValid: false,
            isOwned: false,
            isUsed: false,
            error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
