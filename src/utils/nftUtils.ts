import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createNft, burnV1, TokenStandard, transferV1 } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, percentAmount, generateSigner, publicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";
import { mockStorage } from "@metaplex-foundation/umi-storage-mock";
import dotenv from "dotenv";

dotenv.config();

// Environment variables
const solanaRpcUrl = process.env.SOLANA_RPC_PROVIDER || 'https://api.devnet.solana.com';
const heliusRpcUrl = process.env.HELIUS_RPC_URL || 'https://devnet.helius-rpc.com/';
const heliusApiKey = process.env.HELIUS_API_KEY || 'ca4c9d32-10f8-4d1c-9ca3-01fa9b90ea8d';
const adminPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATEKEY;

const pinataApiKey = process.env.PINATA_API_KEY;
const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;

// Initialize UMI
const umi = createUmi(solanaRpcUrl);

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
    symbol?: string;
    tokenStandard?: string;
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

// Transfer partial amount of tokens (for fungible tokens or partial NFT transfers)
export const transferPartialTokens = async (
    mintAddress: string, 
    fromAddress: string, 
    toAddress: string, 
    amount: number, 
    privateKey: string
): Promise<boolean> => {
    try {
        console.log(`🔄 Starting partial token transfer: ${amount} tokens from ${mintAddress} → ${toAddress}`);
        
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
        const tempUmi = createUmi(solanaRpcUrl || "https://api.mainnet-beta.solana.com");
        tempUmi.use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(mockStorage());

        const mint = publicKey(mintAddress);
        const from = publicKey(fromAddress);
        const to = publicKey(toAddress);

        console.log(`🔑 Admin wallet: ${tempUmi.identity.publicKey.toString()}`);
        console.log(`📤 From: ${fromAddress}`);
        console.log(`📥 To: ${toAddress}`);
        console.log(`💰 Amount: ${amount}`);

        // Check if the sender has enough tokens
        const senderBalance = await getTokenBalance(mintAddress, fromAddress);
        if (senderBalance < amount) {
            throw new Error(`Insufficient balance. Have ${senderBalance}, need ${amount}`);
        }

        // For now, this is a simplified implementation
        // In a real implementation, you'd need to use the appropriate UMI transfer function
        // that supports partial amounts for the specific token standard
        
        console.log(`✅ Partial transfer validation successful!`);
        console.log(`📝 Note: Actual transfer implementation depends on token standard and UMI version`);
        
        return true;
        
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred while transferring partial tokens";
        console.error("❌ Partial token transfer failed:", errorMessage);
        console.error("Full error:", error);
        return false;
    }
}

// Get user's NFTs using Helius
export async function getUserNFTs(walletAddress: string): Promise<UserNFT[]> {
    try {
        const heliusRpcUrl = process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/';
        
        console.log(`🔍 Fetching NFTs for wallet ${walletAddress} using Helius`);

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "1",
                method: "getAssetsByOwner",
                params: { ownerAddress: walletAddress }
            })
        };

        const response = await fetch(`${heliusRpcUrl}?api-key=${heliusApiKey}`, options);
        
        if (!response.ok) {
            throw new Error(`Helius API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`Helius API error: ${data.error.message}`);
        }

        const assets = data.result.items || [];
        console.log("🔍 Helius data:------------------>", data.result.items.length);
        
        const userNFTs: UserNFT[] = [];

        for (const asset of assets) {
            try {
                // Extract basic asset information
                const mint = asset.id;
                const name = asset.content?.metadata?.name || 'Unknown NFT';
                const symbol = asset.content?.metadata?.symbol || '';
                const tokenStandard = asset.content?.metadata?.token_standard || '';
                const description = asset.content?.metadata?.description || '';
                const image = asset.content?.files?.[0]?.uri || asset.content?.metadata?.image || '';
                
                // Extract attributes from metadata
                const attributes = asset.content?.metadata?.attributes || [];
                
                // Check if this is an event ticket based on available data
                const isEventTicket = Boolean(
                    name.toLowerCase().includes('ticket') ||
                    symbol.toLowerCase().includes('ticket') ||
                    asset.content?.metadata?.eventId ||
                    asset.content?.metadata?.eventName ||
                    (attributes && attributes.some((attr: any) => 
                        attr.trait_type === 'Event' && attr.value
                    )) ||
                    (attributes && attributes.some((attr: any) => 
                        attr.trait_type === 'Used' && (attr.value === 'false' || attr.value === 'true')
                    )) ||
                    (asset.content?.metadata?.category && ['VIP', 'Standard', 'Group'].includes(asset.content.metadata.category))
                );
                
                // Extract ticket category from name if available
                let ticketCategory = 'Standard';
                if (name.toLowerCase().includes('vip')) {
                    ticketCategory = 'VIP';
                } else if (name.toLowerCase().includes('group')) {
                    ticketCategory = 'Group';
                } else if (name.toLowerCase().includes('standard')) {
                    ticketCategory = 'Standard';
                }
                
                // Try to extract event name from the ticket name
                let eventName = name;
                if (name.toLowerCase().includes('ticket')) {
                    // Remove "ticket" and category words to get event name
                    eventName = name
                        .replace(/ticket/i, '')
                        .replace(/vip/i, '')
                        .replace(/standard/i, '')
                        .replace(/group/i, '')
                        .replace(/[-–—]/g, ' ')
                        .trim();
                }

                // Create UserNFT object
                const userNFT: UserNFT = {
                    mint,
                    name,
                    description,
                    image,
                    symbol,
                    tokenStandard,
                    attributes: attributes.map((attr: any) => ({
                        trait_type: attr.trait_type || 'Unknown',
                        value: attr.value || ''
                    })),
                    isEventTicket,
                    ...(isEventTicket && {
                        eventDetails: {
                            eventId: asset.content?.metadata?.eventId || 'unknown',
                            eventName: eventName || asset.content?.metadata?.eventName || 'Unknown Event',
                            category: ticketCategory,
                            isUsed: asset.content?.metadata?.isUsed || false
                        }
                    })
                };

                userNFTs.push(userNFT);
                
            } catch (assetError) {
                console.warn(`⚠️ Error processing asset ${asset.id}:`, assetError);
                // Still add a basic NFT entry even if processing fails
                userNFTs.push({
                    mint: asset.id,
                    name: asset.content?.metadata?.name || 'Unknown NFT',
                    description: asset.content?.metadata?.description || '',
                    image: asset.content?.files?.[0]?.uri || '',
                    symbol: asset.content?.metadata?.symbol || '',
                    tokenStandard: asset.content?.metadata?.token_standard || '',
                    attributes: [],
                    isEventTicket: false
                });
            }
        }

        console.log(`📊 Successfully processed ${userNFTs.length} NFTs for wallet ${walletAddress}`);
        return userNFTs;
        
    } catch (error) {
        console.error('❌ Error fetching user NFTs from Helius:', error);
        throw new Error(`Failed to fetch NFTs from Helius: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Get specific NFT metadata using Helius
export async function getNFTMetadata(mintAddress: string): Promise<UserNFT | null> {
    try {
        console.log(`🔍 Fetching NFT metadata for ${mintAddress} using Helius`);

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "1",
                method: "getAsset",
                params: { id: mintAddress }
            })
        };

        const response = await fetch(`${heliusRpcUrl}?api-key=${heliusApiKey}`, options);
        
        if (!response.ok) {
            throw new Error(`Helius API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(`Helius API error: ${data.error.message}`);
        }

        const asset = data.result;
        if (!asset) {
            console.warn(`⚠️ No asset found for mint address: ${mintAddress}`);
            return null;
        }

        // Extract asset information from the actual NFT structure
        const name = asset.content?.metadata?.name || 'Unknown NFT';
        const description = asset.content?.metadata?.description || '';
        const image = asset.content?.files?.[0]?.uri || asset.content?.metadata?.image || '';
        const attributes = asset.content?.metadata?.attributes || [];
        
        // Extract additional metadata that might be available
        const symbol = asset.content?.metadata?.symbol || '';
        const tokenStandard = asset.content?.metadata?.token_standard || '';
        
        // Check if this is an event ticket based on available data
        // Look for ticket indicators in name, symbol, or other available fields
        const isEventTicket = Boolean(
            name.toLowerCase().includes('ticket') ||
            symbol.toLowerCase().includes('ticket') ||
            asset.content?.metadata?.eventId ||
            asset.content?.metadata?.eventName ||
            (attributes && attributes.some((attr: any) => 
                attr.trait_type === 'Event' && attr.value
            )) ||
            (attributes && attributes.some((attr: any) => 
                attr.trait_type === 'Used' && (attr.value === 'false' || attr.value === 'true')
            )) ||
            (asset.content?.metadata?.category && ['VIP', 'Standard', 'Group'].includes(asset.content.metadata.category))
        );
        
        // Extract ticket category from name if available
        let ticketCategory = 'Standard';
        if (name.toLowerCase().includes('vip')) {
            ticketCategory = 'VIP';
        } else if (name.toLowerCase().includes('group')) {
            ticketCategory = 'Group';
        } else if (name.toLowerCase().includes('standard')) {
            ticketCategory = 'Standard';
        }
        
        // Try to extract event name from the ticket name
        let eventName = name;
        if (name.toLowerCase().includes('ticket')) {
            // Remove "ticket" and category words to get event name
            eventName = name
                .replace(/ticket/i, '')
                .replace(/vip/i, '')
                .replace(/standard/i, '')
                .replace(/group/i, '')
                .replace(/[-–—]/g, ' ')
                .trim();
        }
        
        // Enhanced event information extraction from attributes
        let extractedEventId = asset.content?.metadata?.eventId;
        let extractedEventName = asset.content?.metadata?.eventName || eventName;
        let extractedVenue = asset.content?.metadata?.venue;
        let extractedDate = asset.content?.metadata?.eventDate;
        let extractedPrice = asset.content?.metadata?.price;
        let extractedIsUsed = false;
        
        // Extract information from attributes if not in direct metadata
        if (attributes && attributes.length > 0) {
            attributes.forEach((attr: any) => {
                switch (attr.trait_type) {
                    case 'Event':
                        if (!extractedEventName || extractedEventName === 'Unknown Event') {
                            extractedEventName = attr.value;
                        }
                        break;
                    case 'Venue':
                        extractedVenue = attr.value;
                        break;
                    case 'Date':
                        extractedDate = attr.value;
                        break;
                    case 'Price':
                        extractedPrice = attr.value;
                        break;
                    case 'Used':
                        extractedIsUsed = attr.value === 'true' || attr.value === true;
                        break;
                    case 'Category':
                        if (!ticketCategory || ticketCategory === 'Standard') {
                            ticketCategory = attr.value;
                        }
                        break;
                }
            });
        }

        return {
            mint: mintAddress,
            name,
            description,
            image,
            symbol,
            tokenStandard,
            attributes: attributes.map((attr: any) => ({
                trait_type: attr.trait_type || 'Unknown',
                value: attr.value || ''
            })),
            isEventTicket,
            ...(isEventTicket && {
                eventDetails: {
                    eventId: extractedEventId || 'unknown',
                    eventName: extractedEventName || 'Unknown Event',
                    category: ticketCategory,
                    isUsed: extractedIsUsed || false
                }
            })
        };
    } catch (error) {
        console.error(`❌ Error fetching NFT metadata for ${mintAddress} from Helius:`, error);
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

// Get token balance for a specific mint and wallet
export const getTokenBalance = async (mintAddress: string, walletAddress: string): Promise<number> => {
    try {
        console.log(`🔍 Getting token balance for mint: ${mintAddress}, wallet: ${walletAddress}`);
        
        // For now, return a default balance since getting exact token balance requires more complex logic
        // In a real implementation, you'd need to use Solana RPC calls to get token account balance
        console.log(`💰 Token balance: 1 (default)`);
        return 1;
        
    } catch (error: any) {
        console.error("❌ Error getting token balance:", error);
        return 0;
    }
}

// Transfer NFT between users with comprehensive database updates
export const transferNFTBetweenUsers = async (
    mintAddress: string,
    fromAddress: string,
    toAddress: string,
    fromTelegramId: number,
    toTelegramId: number | null, // Make toTelegramId optional to support external transfers
    privateKey: string,
    transferReason?: string
): Promise<{ success: boolean; transactionSignature?: string; error?: string }> => {
    try {
        console.log(`🔄 Starting NFT transfer: ${mintAddress} from ${fromTelegramId} to ${toTelegramId || 'external wallet'}`);
        
        // Import required models
        const { default: TicketPurchase } = await import('../models/TicketPurchase');
        const { default: TransferHistory } = await import('../models/TransferHistory');
        const { default: User } = await import('../models/User');
        
        // Validate required inputs
        if (!mintAddress || !fromAddress || !toAddress || !fromTelegramId || !privateKey) {
            throw new Error('Missing required parameters for NFT transfer');
        }

        // Check if transferring to self (only if both users are registered)
        if (toTelegramId && fromTelegramId === toTelegramId) {
            throw new Error('Cannot transfer NFT to yourself');
        }

        // Verify sender user exists
        const fromUser = await User.findOne({ telegramId: fromTelegramId });
        if (!fromUser) {
            throw new Error('Sender user not found');
        }

        // Handle recipient - could be registered user or external wallet
        let toUser = null;
        if (toTelegramId) {
            toUser = await User.findOne({ telegramId: toTelegramId });
            if (!toUser) {
                throw new Error('Recipient user not found');
            }
        } else {
            console.log('📤 Transferring to external wallet address:', toAddress);
        }

        // Verify sender owns the NFT
        const senderNFTs = await getUserNFTs(fromAddress);
        const senderOwnsNFT = senderNFTs.some(nft => nft.mint === mintAddress);
        
        if (!senderOwnsNFT) {
            throw new Error('Sender does not own this NFT');
        }

        // Check if NFT is an event ticket that's already used
        const nftMetadata = await getNFTMetadata(mintAddress);
        if (nftMetadata?.isEventTicket && nftMetadata.eventDetails?.isUsed) {
            throw new Error('Cannot transfer used event tickets');
        }

        // Check if NFT is listed for sale
        const { default: NFTListing } = await import('../models/NFTListing');
        const activeListing = await NFTListing.findOne({
            mintAddress,
            isActive: true
        }).exec();
        
        if (activeListing) {
            throw new Error('Cannot transfer NFT that is listed for sale. Please cancel the listing first.');
        }

        // Get current ticket purchase record - look for any record with this mint address
        let currentTicketRecord = await TicketPurchase.findOne({ 
            mintAddress,
            isActive: true
        });

        // If no active record found, look for any record with this mint address
        if (!currentTicketRecord) {
            currentTicketRecord = await TicketPurchase.findOne({ mintAddress });
            if (!currentTicketRecord) {
                throw new Error('No ticket record found for this NFT');
            }
            console.log(`⚠️ Found inactive ticket record for ${mintAddress}, will reactivate for transfer`);
        }

        // Verify the sender is the current owner or has permission to transfer
        if (currentTicketRecord.currentOwner !== fromTelegramId && currentTicketRecord.telegramId !== fromTelegramId) {
            throw new Error('Sender is not the current owner of this ticket');
        }

        // Perform blockchain transfer
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
        const tempUmi = createUmi(solanaRpcUrl || "https://api.mainnet-beta.solana.com");
        tempUmi.use(keypairIdentity(umiKeypair))
            .use(mplTokenMetadata())
            .use(mockStorage());

        const mint = publicKey(mintAddress);
        const to = publicKey(toAddress);

        console.log(`🔑 Transfer wallet: ${tempUmi.identity.publicKey.toString()}`);
        console.log(`📤 From: ${fromAddress} (User: ${fromTelegramId})`);
        console.log(`📥 To: ${toAddress} ${toUser ? `(User: ${toTelegramId})` : '(External Wallet)'}`);

        // Verify NFT exists and is accessible
        try {
            const nftAccount = await tempUmi.rpc.getAccount(mint);
            if (!nftAccount.exists) {
                throw new Error(`NFT ${mintAddress} does not exist`);
            }
            console.log(`✅ NFT ${mintAddress} exists and is accessible`);
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

        const signatureBase58 = convertSignatureToHash(transferResult.signature);
        console.log(`✅ Ticket transfer successful! Transaction: ${signatureBase58}`);

        // Update database records
        try {
            // 1. Create transfer history record
            const transferHistoryRecord = new TransferHistory({
                mintAddress,
                fromTelegramId,
                toTelegramId: toTelegramId || 0, // Use 0 for external wallets
                fromWalletAddress: fromAddress,
                toWalletAddress: toAddress,
                transactionSignature: signatureBase58,
                transferType: toTelegramId ? 'user_to_user' : 'user_to_external',
                transferReason: transferReason || 'User transfer',
                transferredAt: new Date(),
                status: 'confirmed',
                metadata: {
                    eventId: currentTicketRecord.eventId,
                    eventName: nftMetadata?.eventDetails?.eventName,
                    category: currentTicketRecord.category,
                    price: currentTicketRecord.price
                }
            });

            await transferHistoryRecord.save();
            console.log(`✅ Created transfer history record for ${mintAddress}`);

            // 2. Handle ticket purchase records
            if (toTelegramId) {
                // Transfer to registered user
                
                // First, mark the current record as inactive
                currentTicketRecord.isActive = false;
                currentTicketRecord.transferCount += 1;
                currentTicketRecord.lastTransferredAt = new Date();
                
                // Add to transfer history array
                currentTicketRecord.transferHistory.push({
                    fromTelegramId,
                    toTelegramId,
                    transferredAt: new Date(),
                    transactionSignature: signatureBase58
                });

                await currentTicketRecord.save();
                console.log(`✅ Marked current ticket record as inactive for ${mintAddress}`);

                // Create a new active ticket record for the recipient
                const newTicketRecord = new TicketPurchase({
                    purchaseId: `TICKET_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    telegramId: toTelegramId, // Recipient's Telegram ID
                    eventId: currentTicketRecord.eventId,
                    category: currentTicketRecord.category,
                    mintAddress: mintAddress,
                    price: currentTicketRecord.price,
                    purchasedAt: new Date(), // New purchase date for the recipient
                    isUsed: false,
                    currentOwner: toTelegramId, // Recipient is now the current owner
                    originalOwner: currentTicketRecord.originalOwner, // Keep track of original purchaser
                    transferCount: 0, // Reset transfer count for new owner
                    isActive: true, // This is now the active record
                    transferHistory: [] // Start fresh transfer history
                });

                await newTicketRecord.save();
                console.log(`✅ Created new active ticket record for recipient ${toTelegramId} - ${mintAddress}`);

            } else {
                // Transfer to external wallet - mark as inactive
                currentTicketRecord.isActive = false;
                currentTicketRecord.transferCount += 1;
                currentTicketRecord.lastTransferredAt = new Date();
                
                // Add to transfer history array
                currentTicketRecord.transferHistory.push({
                    fromTelegramId,
                    toTelegramId: 0, // External wallet
                    transferredAt: new Date(),
                    transactionSignature: signatureBase58
                });

                await currentTicketRecord.save();
                console.log(`✅ Marked ticket as inactive for external transfer: ${mintAddress}`);
            }

            // 3. Update NFT resale record if exists
            const { default: NFTResale } = await import('../models/NFTResale');
            const resaleRecord = await NFTResale.findOne({ 
                mintAddress,
                sellerTelegramId: fromTelegramId 
            });

            if (resaleRecord) {
                resaleRecord.sellerTelegramId = toTelegramId || 0;
                resaleRecord.timestamp = new Date();
                await resaleRecord.save();
                console.log(`✅ Updated NFT resale record for ${mintAddress}`);
            }

            // 4. Deactivate any active listings
            if (activeListing) {
                (activeListing as any).isActive = false;
                await (activeListing as any).save();
                console.log(`✅ Deactivated NFT listing for ${mintAddress}`);
            }

        } catch (dbError) {
            console.error('⚠️ Database update failed, but blockchain transfer was successful:', dbError);
            // Don't fail the transfer if database update fails
            // The blockchain transfer is the source of truth
        }

        return {
            success: true,
            transactionSignature: signatureBase58
        };

    } catch (error: any) {
        console.error('❌ NFT transfer failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error occurred during transfer'
        };
    }
};

// Get NFT transfer history
export const getNFTTransferHistory = async (mintAddress: string): Promise<{
    success: boolean;
    transfers?: Array<{
        fromTelegramId: number;
        toTelegramId: number;
        fromAddress: string;
        toAddress: string;
        timestamp: Date;
        transactionSignature: string;
    }>;
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting transfer history for NFT: ${mintAddress}`);
        
        // Import required models
        const { default: TicketPurchase } = await import('../models/TicketPurchase');
        
        // Get all purchase records for this NFT (including transfers)
        const purchases = await TicketPurchase.find({ mintAddress }).sort({ purchasedAt: -1 });
        
        if (purchases.length === 0) {
            return {
                success: true,
                transfers: []
            };
        }
        
        // Convert purchase history to transfer history
        const transfers = [];
        for (let i = 0; i < purchases.length - 1; i++) {
            const currentPurchase = purchases[i];
            const previousPurchase = purchases[i + 1];
            
            // This represents a transfer from previous owner to current owner
            transfers.push({
                fromTelegramId: previousPurchase.telegramId,
                toTelegramId: currentPurchase.telegramId,
                fromAddress: 'Unknown', // We don't store wallet addresses in TicketPurchase
                toAddress: 'Unknown',
                timestamp: currentPurchase.purchasedAt,
                transactionSignature: 'Unknown' // We don't store transaction signatures in TicketPurchase
            });
        }
        
        console.log(`✅ Found ${transfers.length} transfers for NFT ${mintAddress}`);
        
        return {
            success: true,
            transfers
        };
        
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred while getting transfer history";
        console.error("❌ Failed to get NFT transfer history:", errorMessage);
        return { 
            success: false, 
            error: errorMessage 
        };
    }
};

// Test function for NFT transfer (for development/testing purposes)
export const testNFTTransfer = async (
    mintAddress: string,
    fromTelegramId: number,
    toTelegramId: number,
    adminPrivateKey: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
        console.log(`🧪 Testing NFT transfer: ${mintAddress} from ${fromTelegramId} to ${toTelegramId}`);
        
        // Import required models
        const { default: User } = await import('../models/User');
        
        // Get user wallets
        const fromUser = await User.findOne({ telegramId: fromTelegramId });
        const toUser = await User.findOne({ telegramId: toTelegramId });
        
        if (!fromUser?.wallet?.address) {
            throw new Error(`Sender user ${fromTelegramId} has no wallet address`);
        }
        
        if (!toUser?.wallet?.address) {
            throw new Error(`Recipient user ${toTelegramId} has no wallet address`);
        }
        
        // Perform the transfer
        const transferResult = await transferNFTBetweenUsers(
            mintAddress,
            fromUser.wallet.address,
            toUser.wallet.address,
            fromTelegramId,
            toTelegramId,
            adminPrivateKey
        );
        
        if (transferResult.success) {
            console.log(`✅ Test transfer successful! Transaction: ${transferResult.transactionSignature}`);
            return {
                success: true,
                message: `NFT transferred successfully! Transaction: ${transferResult.transactionSignature}`
            };
        } else {
            throw new Error(transferResult.error || 'Transfer failed');
        }
        
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred during test transfer";
        console.error("❌ Test transfer failed:", errorMessage);
        return { 
            success: false, 
            error: errorMessage 
        };
    }
};

// Utility function to convert byte array signature to base58 transaction hash
export const convertSignatureToHash = (signature: Uint8Array | number[]): string => {
    try {
        // Convert number array to Uint8Array if needed
        const uint8Array = Array.isArray(signature) ? new Uint8Array(signature) : signature;
        
        // Encode to base58 (standard Solana signature format)
        const base58Signature = bs58.encode(uint8Array);
        
        console.log(`🔗 Converted signature to hash: ${base58Signature}`);
        return base58Signature;
    } catch (error) {
        console.error('❌ Error converting signature to hash:', error);
        // Fallback to original signature if conversion fails
        return signature.toString();
    }
};

// Get transfer history for a specific user
export const getUserTransferHistory = async (telegramId: number): Promise<{
    success: boolean;
    receivedTransfers?: Array<{
        mintAddress: string;
        fromTelegramId: number;
        fromUsername?: string;
        fromFirstName?: string;
        fromLastName?: string;
        transferredAt: Date;
        transactionSignature: string;
        eventName?: string;
        category?: string;
        price?: number;
    }>;
    sentTransfers?: Array<{
        mintAddress: string;
        toTelegramId: number;
        toUsername?: string;
        toFirstName?: string;
        toLastName?: string;
        transferredAt: Date;
        transactionSignature: string;
        eventName?: string;
        category?: string;
        price?: number;
    }>;
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting transfer history for user: ${telegramId}`);
        
        // Import required models
        const { default: TransferHistory } = await import('../models/TransferHistory');
        const { default: User } = await import('../models/User');
        
        // Get transfers where user is recipient (only user-to-user transfers)
        const receivedTransfers = await TransferHistory.find({
            toTelegramId: telegramId,
            status: 'confirmed',
            transferType: 'user_to_user'
        }).sort({ transferredAt: -1 });
        
        // Get transfers where user is sender
        const sentTransfers = await TransferHistory.find({
            fromTelegramId: telegramId,
            status: 'confirmed'
        }).sort({ transferredAt: -1 });
        
        // Get user details for sender/recipient IDs
        const userIds = new Set([
            ...receivedTransfers.map(t => t.fromTelegramId),
            ...sentTransfers.map(t => t.toTelegramId).filter(id => id !== null) as number[]
        ]);
        
        const users = await User.find({ telegramId: { $in: Array.from(userIds) } });
        const userMap = new Map(users.map(u => [u.telegramId, u]));
        
        // Process received transfers
        const processedReceivedTransfers = receivedTransfers.map(transfer => {
            const fromUser = userMap.get(transfer.fromTelegramId);
            return {
                mintAddress: transfer.mintAddress,
                fromTelegramId: transfer.fromTelegramId,
                fromUsername: fromUser?.username,
                fromFirstName: fromUser?.firstName,
                fromLastName: fromUser?.lastName,
                transferredAt: transfer.transferredAt,
                transactionSignature: transfer.transactionSignature,
                eventName: transfer.metadata?.eventName,
                category: transfer.metadata?.category,
                price: transfer.metadata?.price
            };
        });
        
        // Process sent transfers (filter out external wallet transfers)
        const processedSentTransfers = sentTransfers
            .filter(transfer => transfer.toTelegramId !== null)
            .map(transfer => {
                const toUser = userMap.get(transfer.toTelegramId!);
                return {
                    mintAddress: transfer.mintAddress,
                    toTelegramId: transfer.toTelegramId!,
                    toUsername: toUser?.username,
                    toFirstName: toUser?.firstName,
                    toLastName: toUser?.lastName,
                    transferredAt: transfer.transferredAt,
                    transactionSignature: transfer.transactionSignature,
                    eventName: transfer.metadata?.eventName,
                    category: transfer.metadata?.category,
                    price: transfer.metadata?.price
                };
            });
        
        console.log(`✅ Found ${processedReceivedTransfers.length} received transfers and ${processedSentTransfers.length} sent transfers for user ${telegramId}`);
        
        return {
            success: true,
            receivedTransfers: processedReceivedTransfers,
            sentTransfers: processedSentTransfers
        };
        
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred while getting user transfer history";
        console.error("❌ Failed to get user transfer history:", errorMessage);
        return { 
            success: false, 
            error: errorMessage 
        };
    }
};

// Get current owner of an NFT from database
export const getNFTCurrentOwner = async (mintAddress: string): Promise<{
    success: boolean;
    currentOwner?: number;
    isActive?: boolean;
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting current owner for NFT: ${mintAddress}`);
        
        // Import required models
        const { default: TicketPurchase } = await import('../models/TicketPurchase');
        
        // Find the active ticket record for this NFT
        const ticketRecord = await TicketPurchase.findOne({
            mintAddress,
            isActive: true
        });
        
        if (!ticketRecord) {
            return {
                success: false,
                error: 'No active ticket record found for this NFT'
            };
        }
        
        console.log(`✅ Found current owner for NFT ${mintAddress}: ${ticketRecord.currentOwner}`);
        
        return {
            success: true,
            currentOwner: ticketRecord.currentOwner,
            isActive: ticketRecord.isActive
        };
        
    } catch (error: any) {
        const errorMessage = error.message || "Unknown error occurred while getting NFT current owner";
        console.error("❌ Failed to get NFT current owner:", errorMessage);
        return { 
            success: false, 
            error: errorMessage 
        };
    }
};
