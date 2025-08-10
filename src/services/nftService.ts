import { getUserNFTs, transferNFTToUser, mintNFT, createEventTickets, validateTicketEntry, markTicketAsUsed, NFTMetadata, UserNFT, getNFTMetadata } from '../utils/nftUtils';
import { getUserWallet, getUserWalletPrivateKey } from './walletService';
import Event, { IEvent } from '../models/Event';
import TicketPurchase, { ITicketPurchase } from '../models/TicketPurchase';
import NFTListing, { INFTListing } from '../models/NFTListing';
import NFTResale, { INFTResale } from '../models/NFTResale';
import bs58 from 'bs58';

interface NFTEvent {
    eventId: string;
    name: string;
    description: string;
    date: Date;
    venue: string;
    imageUrl: string;
    categories: Array<{
        category: 'VIP' | 'Standard' | 'Group';
        price: number;
        maxSupply: number;
        currentSupply: number;
        mintAddresses: string[];
    }>;
    isActive: boolean;
    createdBy: number; // Telegram ID of creator
    createdAt: Date;
}

interface TicketPurchaseData {
    purchaseId: string;
    telegramId: number;
    eventId: string;
    category: 'VIP' | 'Standard' | 'Group';
    mintAddress: string;
    price: number;
    purchasedAt: Date;
    isUsed: boolean;
    usedAt?: Date;
}

// NFT Marketplace Interfaces
interface NFTListing {
    listingId: string;
    sellerTelegramId: number;
    mintAddress: string;
    price: number;
    listingType: 'fixed' | 'auction';
    startTime: Date;
    endTime?: Date;
    isActive: boolean;
    originalPrice?: number; // For resale tracking
    maxResalePrice?: number; // Price cap for resales
    resaleCount: number;
    maxResales: number;
}

interface NFTResale {
    resaleId: string;
    originalListingId: string;
    sellerTelegramId: number;
    buyerTelegramId: number;
    mintAddress: string;
    price: number;
    resaleNumber: number;
    timestamp: Date;
    royaltyPaid: number;
}

// Admin configuration
const ADMIN_TELEGRAM_IDS = [7868262962]; // Add your admin Telegram ID here

function isAdmin(telegramId: number): boolean {
    return ADMIN_TELEGRAM_IDS.includes(telegramId);
}

// Get NFT details by mint address
async function getNFTDetails(mintAddress: string): Promise<{
    success: boolean;
    nft?: UserNFT;
    error?: string;
}> {
    try {
        if (!mintAddress) {
            throw new Error('Mint address is required');
        }

        const nftMetadata = await getNFTMetadata(mintAddress);
        if (!nftMetadata) {
            return {
                success: false,
                error: 'NFT not found'
            };
        }

        return {
            success: true,
            nft: nftMetadata
        };
    } catch (error) {
        console.error('Error getting NFT details:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Get user's NFTs with better filtering and error handling
async function getUserNFTsWithFilters(telegramId: number, filter?: {
    type?: 'all' | 'tickets' | 'collectibles';
    event?: string;
}): Promise<{
    nfts: UserNFT[];
    totalCount: number;
    ticketCount: number;
    collectibleCount: number;
}> {
    try {
        if (!telegramId) {
            throw new Error('Telegram ID is required');
        }

        // Get user wallet
        const wallet = await getUserWallet(telegramId);
        if (!wallet) {
            console.log(`No wallet found for user ${telegramId}`);
            return {
                nfts: [],
                totalCount: 0,
                ticketCount: 0,
                collectibleCount: 0
            };
        }

        // Get NFTs from blockchain
        const nfts = await getUserNFTs(wallet.address);
        
        if (!nfts || nfts.length === 0) {
            return {
                nfts: [],
                totalCount: 0,
                ticketCount: 0,
                collectibleCount: 0
            };
        }

        // Apply filters
        let filteredNFTs = nfts;

        if (filter?.type && filter.type !== 'all') {
            if (filter.type === 'tickets') {
                filteredNFTs = nfts.filter(nft => nft.isEventTicket);
            } else if (filter.type === 'collectibles') {
                filteredNFTs = nfts.filter(nft => !nft.isEventTicket);
            }
        }

        if (filter?.event) {
            filteredNFTs = filteredNFTs.filter(nft => 
                nft.eventDetails?.eventId === filter.event
            );
        }

        // Count by type
        const ticketCount = nfts.filter(nft => nft.isEventTicket).length;
        const collectibleCount = nfts.filter(nft => !nft.isEventTicket).length;

        return {
            nfts: filteredNFTs,
            totalCount: filteredNFTs.length,
            ticketCount,
            collectibleCount
        };
    } catch (error) {
        console.error('Error getting user NFTs with filters:', error);
        return {
            nfts: [],
            totalCount: 0,
            ticketCount: 0,
            collectibleCount: 0
        };
    }
}

// Get all events
async function getAllEvents(): Promise<NFTEvent[]> {
    try {
        const dbEvents = await Event.find({});
        return dbEvents.map(dbEvent => ({
            eventId: dbEvent.eventId,
            name: dbEvent.name,
            description: dbEvent.description,
            date: dbEvent.date,
            venue: dbEvent.venue,
            imageUrl: dbEvent.imageUrl,
            categories: dbEvent.categories.map(cat => ({
                category: cat.category,
                price: cat.price,
                maxSupply: cat.maxSupply,
                currentSupply: cat.currentSupply,
                mintAddresses: cat.mintAddresses
            })),
            isActive: dbEvent.isActive,
            createdBy: dbEvent.createdBy,
            createdAt: dbEvent.createdAt
        }));
    } catch (error) {
        console.error('Error getting all events:', error);
        return [];
    }
}

// Get event by ID
async function getEvent(eventId: string): Promise<NFTEvent | null> {
    try {
        const dbEvent = await Event.findOne({ eventId });
        if (!dbEvent) return null;
        
        return {
            eventId: dbEvent.eventId,
            name: dbEvent.name,
            description: dbEvent.description,
            date: dbEvent.date,
            venue: dbEvent.venue,
            imageUrl: dbEvent.imageUrl,
            categories: dbEvent.categories.map(cat => ({
                category: cat.category,
                price: cat.price,
                maxSupply: cat.maxSupply,
                currentSupply: cat.currentSupply,
                mintAddresses: cat.mintAddresses
            })),
            isActive: dbEvent.isActive,
            createdBy: dbEvent.createdBy,
            createdAt: dbEvent.createdAt
        };
    } catch (error) {
        console.error('Error getting event:', error);
        return null;
    }
}

// Create a new event (Admin only)
async function createEvent(
    creatorTelegramId: number,
    eventData: {
        name: string;
        description: string;
        date: Date;
        venue: string;
        imageUrl: string;
        categories: Array<{
            category: 'VIP' | 'Standard' | 'Group';
            price: number;
            maxSupply: number;
            baseImageUrl: string;
        }>;
    }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
        if (!isAdmin(creatorTelegramId)) {
            throw new Error('Only admins can create events');
        }

        // Validate input data
        if (!eventData.name || !eventData.description || !eventData.venue || !eventData.imageUrl) {
            throw new Error('Missing required event information');
        }

        if (!eventData.categories || eventData.categories.length === 0) {
            throw new Error('At least one category must be specified');
        }

        // Validate categories
        for (const cat of eventData.categories) {
            if (!cat.category || !cat.price || !cat.maxSupply || !cat.baseImageUrl) {
                throw new Error(`Invalid category data for ${cat.category}`);
            }
            if (cat.maxSupply <= 0) {
                throw new Error(`Invalid max supply for ${cat.category}: must be greater than 0`);
            }
            if (cat.price < 0) {
                throw new Error(`Invalid price for ${cat.category}: must be non-negative`);
            }
        }

        const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`🔄 Creating NFT tickets for event: ${eventId}`);
        
        // Create NFT tickets for all categories
        const ticketMints = await createEventTickets({
            eventId,
            eventName: eventData.name,
            eventDate: eventData.date.toISOString(),
            venue: eventData.venue,
            categories: eventData.categories.map(cat => ({
                category: cat.category,
                quantity: cat.maxSupply,
                price: cat.price,
                baseImageUrl: cat.baseImageUrl
            }))
        });

        // Validate ticket creation results
        if (!ticketMints || typeof ticketMints !== 'object') {
            throw new Error('Failed to create NFT tickets: invalid response from createEventTickets');
        }

        // Check if all categories have tickets
        for (const cat of eventData.categories) {
            if (!ticketMints[cat.category] || ticketMints[cat.category].length === 0) {
                throw new Error(`Failed to create tickets for category: ${cat.category}`);
            }
            if (ticketMints[cat.category].length !== cat.maxSupply) {
                console.warn(`⚠️ Warning: Expected ${cat.maxSupply} tickets for ${cat.category}, but got ${ticketMints[cat.category].length}`);
            }
        }

        // Create event object
        const newEvent: NFTEvent = {
            eventId,
            name: eventData.name,
            description: eventData.description,
            date: eventData.date,
            venue: eventData.venue,
            imageUrl: eventData.imageUrl,
            categories: eventData.categories.map(cat => ({
                category: cat.category,
                price: cat.price,
                maxSupply: cat.maxSupply,
                currentSupply: 0,
                mintAddresses: ticketMints[cat.category] || []
            })),
            isActive: true,
            createdBy: creatorTelegramId,
            createdAt: new Date()
        };

        // Save to database
        const dbEvent = new Event(newEvent);
        await dbEvent.save();
        
        console.log(`✅ Event created successfully: ${eventId}`);
        console.log(`📊 Event summary: ${eventData.categories.length} categories, ${Object.values(ticketMints).flat().length} total tickets`);
        
        return { success: true, eventId };
    } catch (error) {
        console.error('Error creating event:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Purchase ticket for event
async function purchaseTicket(
    telegramId: number,
    eventId: string,
    category: 'VIP' | 'Standard' | 'Group'
): Promise<{
    success: boolean;
    mintAddress?: string;
    purchaseId?: string;
    error?: string;
}> {
    try {
        // Validate inputs
        if (!telegramId || !eventId || !category) {
            throw new Error('Missing required parameters');
        }

        // Get event from database
        const event = await Event.findOne({ eventId });
        if (!event) {
            throw new Error('Event not found');
        }

        if (!event.isActive) {
            throw new Error('Event is not active');
        }

        const categoryData = event.categories.find(cat => cat.category === category);
        if (!categoryData) {
            throw new Error(`Category '${category}' not found for this event`);
        }

        if (categoryData.mintAddresses.length === 0) {
            throw new Error(`No tickets available for ${category} category`);
        }

        // Get user wallet
        const userWallet = await getUserWallet(telegramId);
        if (!userWallet) {
            throw new Error('User wallet not found. Please create a wallet first.');
        }

        // Check if user already has a ticket for this event
        const existingPurchase = await TicketPurchase.findOne({
            telegramId,
            eventId,
            category
        });
        if (existingPurchase) {
            throw new Error(`You already have a ${category} ticket for this event`);
        }

        // Get the first available ticket
        if (categoryData.mintAddresses.length === 0) {
            throw new Error('No tickets available for this category');
        }
        
        const mintAddress = categoryData.mintAddresses.shift()!;

        // Transfer ticket to user (using admin private key)
        const adminPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATEKEY;
        if (!adminPrivateKey) {
            // Return the ticket to available tickets
            categoryData.mintAddresses.unshift(mintAddress);
            throw new Error('Admin private key not configured. Please contact support.');
        }

        console.log(`🔄 Transferring ticket ${mintAddress} to user ${telegramId} (${userWallet.address})`);
        
        const transferSuccess = await transferNFTToUser(mintAddress, userWallet.address, adminPrivateKey);
        
        if (!transferSuccess) {
            // Return the ticket to available tickets
            categoryData.mintAddresses.unshift(mintAddress);
            throw new Error('Failed to transfer ticket - please try again');
        }

        // Update the event in database to reflect the ticket being sold
        await event.save();
        
        // Create purchase record
        const purchaseId = `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const purchase: TicketPurchaseData = {
            purchaseId,
            telegramId,
            eventId,
            category,
            mintAddress,
            price: categoryData.price,
            purchasedAt: new Date(),
            isUsed: false
        };

        // Save purchase record
        const dbPurchase = new TicketPurchase(purchase);
        await dbPurchase.save();
        
        console.log(`✅ Ticket purchased successfully: ${purchaseId} - ${mintAddress} for user ${telegramId}`);
        console.log(`📊 Event ${eventId} - ${category} category: ${categoryData.mintAddresses.length} tickets remaining`);
        
        return {
            success: true,
            mintAddress,
            purchaseId
        };
    } catch (error) {
        console.error('Error purchasing ticket:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Validate ticket for event entry
async function validateTicketForEntry(
    telegramId: number,
    mintAddress: string,
    eventId: string
): Promise<{
    isValid: boolean;
    canEnter: boolean;
    error?: string;
}> {
    try {
        // Validate inputs
        if (!telegramId || !mintAddress || !eventId) {
            return {
                isValid: false,
                canEnter: false,
                error: 'Missing required parameters'
            };
        }

        // Get user wallet
        const userWallet = await getUserWallet(telegramId);
        if (!userWallet) {
            return {
                isValid: false,
                canEnter: false,
                error: 'User wallet not found'
            };
        }

        // Get event details
        const event = await Event.findOne({ eventId });
        if (!event) {
            return {
                isValid: false,
                canEnter: false,
                error: 'Event not found'
            };
        }

        if (!event.isActive) {
            return {
                isValid: false,
                canEnter: false,
                error: 'Event is not active'
            };
        }

        // Get NFT metadata
        const nftMetadata = await getNFTMetadata(mintAddress);
        if (!nftMetadata) {
            return {
                isValid: false,
                canEnter: false,
                error: 'NFT not found'
            };
        }

        // Check if NFT is an event ticket
        if (!nftMetadata.isEventTicket) {
            return {
                isValid: false,
                canEnter: false,
                error: 'This NFT is not an event ticket'
            };
        }

        // Check if ticket is for the correct event
        if (nftMetadata.eventDetails?.eventId !== eventId) {
            return {
                isValid: false,
                canEnter: false,
                error: 'This ticket is not for this event'
            };
        }

        // Check if ticket is already used
        if (nftMetadata.eventDetails?.isUsed) {
            return {
                isValid: true,
                canEnter: false,
                error: 'This ticket has already been used'
            };
        }

        // Check if user owns the ticket
        // Note: In a real implementation, you'd verify this on-chain
        // For now, we'll check the purchase record
        const purchase = await TicketPurchase.findOne({
            telegramId,
            eventId,
            mintAddress
        });

        if (!purchase) {
            return {
                isValid: false,
                canEnter: false,
                error: 'You do not own this ticket'
            };
        }

        if (purchase.isUsed) {
            return {
                isValid: true,
                canEnter: false,
                error: 'This ticket has already been used'
            };
        }

        // Check if event date is today or in the past
        const now = new Date();
        const eventDate = new Date(event.date);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

        if (eventDay > today) {
            return {
                isValid: true,
                canEnter: false,
                error: 'Event has not started yet'
            };
        }

        // Ticket is valid and user can enter
        return {
            isValid: true,
            canEnter: true
        };
    } catch (error) {
        console.error('Error validating ticket for entry:', error);
        return {
            isValid: false,
            canEnter: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Use ticket for event entry
async function useTicketForEntry(
    telegramId: number,
    mintAddress: string,
    eventId: string
): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        // Validate inputs
        if (!telegramId || !mintAddress || !eventId) {
            throw new Error('Missing required parameters');
        }

        // First validate the ticket
        const validation = await validateTicketForEntry(telegramId, mintAddress, eventId);
        if (!validation.isValid) {
            throw new Error(validation.error || 'Ticket validation failed');
        }

        if (!validation.canEnter) {
            throw new Error(validation.error || 'Ticket cannot be used for entry');
        }

        // Get the purchase record
        const purchase = await TicketPurchase.findOne({
            telegramId,
            eventId,
            mintAddress
        });

        if (!purchase) {
            throw new Error('Purchase record not found');
        }

        if (purchase.isUsed) {
            throw new Error('Ticket has already been used');
        }

        // Mark ticket as used
        purchase.isUsed = true;
        purchase.usedAt = new Date();
        await purchase.save();

        // Update NFT metadata to mark as used
        // Note: In a real implementation, you'd update this on-chain
        // For now, we'll just log it
        console.log(`🎫 Ticket marked as used: ${mintAddress} for event ${eventId} by user ${telegramId}`);

        // Log entry for audit purposes
        console.log(`✅ Entry granted: User ${telegramId} entered event ${eventId} with ticket ${mintAddress} at ${new Date().toISOString()}`);

        return { success: true };
    } catch (error) {
        console.error('Error using ticket for entry:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Get user's ticket purchases
async function getUserTicketPurchases(telegramId: number): Promise<TicketPurchaseData[]> {
    try {
        const purchases = await TicketPurchase.find({ telegramId });
        return purchases.map(purchase => ({
            purchaseId: purchase.purchaseId,
            telegramId: purchase.telegramId,
            eventId: purchase.eventId,
            category: purchase.category,
            mintAddress: purchase.mintAddress,
            price: purchase.price,
            purchasedAt: purchase.purchasedAt,
            isUsed: purchase.isUsed,
            usedAt: purchase.usedAt
        }));
    } catch (error) {
        console.error('Error getting user ticket purchases:', error);
        return [];
    }
}

// Admin function to mint custom NFT
async function mintCustomNFT(
    creatorTelegramId: number,
    metadata: NFTMetadata
): Promise<{ success: boolean; mintAddress?: string; error?: string }> {
    try {
        // Validate inputs
        if (!creatorTelegramId || !metadata) {
            throw new Error('Missing required parameters');
        }

        if (!metadata.name || !metadata.symbol || !metadata.description) {
            throw new Error('Missing required NFT metadata (name, symbol, description)');
        }

        if (!metadata.image) {
            throw new Error('NFT image is required');
        }

        // Get creator wallet
        const creatorWallet = await getUserWallet(creatorTelegramId);
        if (!creatorWallet) {
            throw new Error('Creator wallet not found. Please create a wallet first.');
        }

        // Check if user has sufficient balance for minting
        // Note: In a real implementation, you'd check SOL balance for transaction fees
        console.log(`🔄 Minting custom NFT: ${metadata.name} for user ${creatorTelegramId}`);

        // Mint the NFT
        const mintAddress = await mintNFT(metadata);
        
        if (!mintAddress) {
            throw new Error('Failed to mint NFT: no mint address returned');
        }

        console.log(`✅ Custom NFT minted successfully: ${mintAddress} - ${metadata.name}`);
        console.log(`👤 Creator: ${creatorTelegramId} (${creatorWallet.address})`);

        return {
            success: true,
            mintAddress: mintAddress
        };
    } catch (error) {
        console.error('Error minting custom NFT:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// NFT Marketplace Functions

// List NFT for sale
async function listNFTForSale(
    sellerTelegramId: number,
    mintAddress: string,
    price: number,
    listingType: 'fixed' | 'auction' = 'fixed',
    auctionEndTime?: Date
): Promise<{ success: boolean; listingId?: string; error?: string }> {
    try {
        // Verify NFT ownership
        const wallet = await getUserWallet(sellerTelegramId);
        if (!wallet) {
            throw new Error('User wallet not found');
        }

        // Check if user owns the NFT using a simpler ownership check
        const nftMetadata = await getNFTMetadata(mintAddress);
        if (!nftMetadata) {
            throw new Error('NFT not found');
        }

        // For event tickets, we need to check if they're already used
        if (nftMetadata.isEventTicket && nftMetadata.eventDetails?.isUsed) {
            throw new Error('Cannot list used event tickets for sale');
        }

        // Check if NFT is already listed
        const existingListing = await NFTListing.findOne({
            mintAddress,
            isActive: true
        });
        if (existingListing) {
            throw new Error('This NFT is already listed for sale');
        }

        // Check resale limits for event tickets
        if (nftMetadata.isEventTicket) {
            const resaleCount = await NFTResale.countDocuments({ mintAddress });
            
            if (resaleCount >= 3) { // Max 3 resales per ticket
                throw new Error('Maximum resales reached for this ticket');
            }
        }

        // Apply price cap for resales (2x original price)
        // Get the original purchase price from the database
        const purchase = await TicketPurchase.findOne({ mintAddress });
        const originalPrice = purchase?.price || 0;
        if (price > originalPrice * 2) {
            throw new Error(`Resale price cannot exceed ${originalPrice * 2} SOL (2x original price)`);
        }

        const listingId = `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create listing object that matches the database model
        const listingData = {
            listingId,
            sellerTelegramId,
            mintAddress,
            price,
            listingType,
            startTime: new Date(),
            endTime: auctionEndTime,
            isActive: true,
            originalPrice: purchase?.price || undefined,
            maxResalePrice: purchase?.price ? purchase.price * 2 : undefined,
            resaleCount: await NFTResale.countDocuments({ mintAddress }),
            maxResales: nftMetadata?.isEventTicket ? 3 : 10
        };

        // Save to database
        const dbListing = new NFTListing(listingData);
        await dbListing.save();
        
        console.log(`✅ NFT listed for sale: ${listingId} - ${mintAddress} at ${price} SOL`);
        return { success: true, listingId };
    } catch (error) {
        console.error('Error listing NFT for sale:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Get all active NFT listings
async function getActiveNFTListings(): Promise<NFTListing[]> {
    try {
        const listings = await NFTListing.find({ isActive: true });
        return listings.map(listing => ({
            listingId: listing.listingId,
            sellerTelegramId: listing.sellerTelegramId,
            mintAddress: listing.mintAddress,
            price: listing.price,
            listingType: listing.listingType,
            startTime: listing.startTime,
            endTime: listing.endTime,
            isActive: listing.isActive,
            originalPrice: listing.originalPrice,
            maxResalePrice: listing.maxResalePrice,
            resaleCount: listing.resaleCount,
            maxResales: listing.maxResales
        }));
    } catch (error) {
        console.error('Error getting active NFT listings:', error);
        return [];
    }
}

// Get NFT listings by seller
async function getNFTListingsBySeller(sellerTelegramId: number): Promise<NFTListing[]> {
    try {
        const listings = await NFTListing.find({
            sellerTelegramId,
            isActive: true
        });
        return listings.map(listing => ({
            listingId: listing.listingId,
            sellerTelegramId: listing.sellerTelegramId,
            mintAddress: listing.mintAddress,
            price: listing.price,
            listingType: listing.listingType,
            startTime: listing.startTime,
            endTime: listing.endTime,
            isActive: listing.isActive,
            originalPrice: listing.originalPrice,
            maxResalePrice: listing.maxResalePrice,
            resaleCount: listing.resaleCount,
            maxResales: listing.maxResales
        }));
    } catch (error) {
        console.error('Error getting NFT listings by seller:', error);
        return [];
    }
}

// Buy NFT from marketplace
async function buyNFTFromMarketplace(
    buyerTelegramId: number,
    listingId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Validate inputs
        if (!buyerTelegramId || !listingId) {
            throw new Error('Missing required parameters');
        }

        // Get the listing
        const listing = await NFTListing.findOne({ listingId, isActive: true });
        if (!listing) {
            throw new Error('Listing not found or no longer active');
        }

        // Check if user is trying to buy their own listing
        if (listing.sellerTelegramId === buyerTelegramId) {
            throw new Error('You cannot buy your own listing');
        }

        // Check if auction has ended (for auction listings)
        if (listing.listingType === 'auction' && listing.endTime && new Date() > listing.endTime) {
            throw new Error('Auction has ended');
        }

        // Get buyer wallet
        const buyerWallet = await getUserWallet(buyerTelegramId);
        if (!buyerWallet) {
            throw new Error('Buyer wallet not found');
        }

        // Get seller wallet
        const sellerWallet = await getUserWallet(listing.sellerTelegramId);
        if (!sellerWallet) {
            throw new Error('Seller wallet not found');
        }

        // Get NFT metadata
        const nftMetadata = await getNFTMetadata(listing.mintAddress);
        if (!nftMetadata) {
            throw new Error('NFT metadata not found');
        }

        // Check if NFT is still owned by seller
        // Note: In a real implementation, you'd verify this on-chain
        console.log(`🔄 Processing purchase: ${listingId} - ${listing.mintAddress} for ${listing.price} SOL`);

        // Transfer NFT from seller to buyer
        const sellerPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATEKEY;
        if (!sellerPrivateKey) {
            throw new Error('Admin private key not configured. Please contact support.');
        }

        // For now, we'll simulate the transfer
        // In a real implementation, you'd use the seller's private key or a smart contract
        console.log(`🔄 Transferring NFT ${listing.mintAddress} from ${sellerWallet.address} to ${buyerWallet.address}`);

        // Mark listing as inactive
        listing.isActive = false;
        await listing.save();

        // Create resale record if this is a resale
        if (nftMetadata.isEventTicket && listing.originalPrice) {
            const resaleId = `resale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const resale = new NFTResale({
                resaleId,
                originalListingId: listingId,
                sellerTelegramId: listing.sellerTelegramId,
                buyerTelegramId,
                mintAddress: listing.mintAddress,
                price: listing.price,
                resaleNumber: listing.resaleCount + 1,
                timestamp: new Date(),
                royaltyPaid: listing.price * 0.05 // 5% royalty
            });
            await resale.save();
        }

        console.log(`✅ NFT purchased successfully: ${listingId} - ${listing.mintAddress} transferred to ${buyerWallet.address}`);
        
        return { success: true };
    } catch (error) {
        console.error('Error buying NFT from marketplace:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Cancel NFT listing
async function cancelNFTListing(
    sellerTelegramId: number,
    listingId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const listing = await NFTListing.findOne({ listingId });
        if (!listing) {
            throw new Error('Listing not found');
        }

        if (listing.sellerTelegramId !== sellerTelegramId) {
            throw new Error('Only the seller can cancel this listing');
        }

        if (!listing.isActive) {
            throw new Error('Listing is already inactive');
        }

        listing.isActive = false;
        await listing.save();
        
        console.log(`✅ NFT listing cancelled: ${listingId}`);
        return { success: true };
    } catch (error) {
        console.error('Error cancelling NFT listing:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Get NFT resale history
async function getNFTResaleHistory(mintAddress: string): Promise<NFTResale[]> {
    try {
        const resales = await NFTResale.find({ mintAddress })
            .sort({ timestamp: -1 });
        
        return resales.map(resale => ({
            resaleId: resale.resaleId,
            originalListingId: resale.originalListingId,
            sellerTelegramId: resale.sellerTelegramId,
            buyerTelegramId: resale.buyerTelegramId,
            mintAddress: resale.mintAddress,
            price: resale.price,
            resaleNumber: resale.resaleNumber,
            timestamp: resale.timestamp,
            royaltyPaid: resale.royaltyPaid
        }));
    } catch (error) {
        console.error('Error getting NFT resale history:', error);
        return [];
    }
}

// Get available tickets for an event
async function getAvailableTickets(eventId: string): Promise<Array<{
    category: string;
    price: number;
    available: number;
    total: number;
}>> {
    try {
        const event = await Event.findOne({ eventId });
        if (!event) return [];

        return event.categories.map(cat => ({
            category: cat.category,
            price: cat.price,
            available: cat.mintAddresses.length,
            total: cat.maxSupply
        }));
    } catch (error) {
        console.error('Error getting available tickets:', error);
        return [];
    }
}

// Get events with ticket availability
async function getEventsWithTicketAvailability(): Promise<Array<{
    eventId: string;
    name: string;
    totalTickets: number;
    availableTickets: number;
    soldTickets: number;
}>> {
    try {
        const events = await Event.find({});
        return events.map(event => {
            const totalTickets = event.categories.reduce((sum, cat) => sum + cat.maxSupply, 0);
            const availableTickets = event.categories.reduce((sum, cat) => sum + cat.mintAddresses.length, 0);
            const soldTickets = totalTickets - availableTickets;

            return {
                eventId: event.eventId,
                name: event.name,
                totalTickets,
                availableTickets,
                soldTickets
            };
        });
    } catch (error) {
        console.error('Error getting events with ticket availability:', error);
        return [];
    }
}

// Get event statistics
async function getEventStatistics(eventId: string): Promise<{
    totalTickets: number;
    soldTickets: number;
    availableTickets: number;
    revenue: number;
    categoryBreakdown: Array<{
        category: string;
        total: number;
        sold: number;
        available: number;
        revenue: number;
    }>;
}> {
    try {
        const event = await Event.findOne({ eventId });
        if (!event) {
            return {
                totalTickets: 0,
                soldTickets: 0,
                availableTickets: 0,
                revenue: 0,
                categoryBreakdown: []
            };
        }

        const categoryBreakdown = event.categories.map(cat => {
            const sold = cat.maxSupply - cat.mintAddresses.length;
            const revenue = sold * cat.price;
            
            return {
                category: cat.category,
                total: cat.maxSupply,
                sold,
                available: cat.mintAddresses.length,
                revenue
            };
        });

        const totalTickets = event.categories.reduce((sum, cat) => sum + cat.maxSupply, 0);
        const soldTickets = event.categories.reduce((sum, cat) => sum + (cat.maxSupply - cat.mintAddresses.length), 0);
        const availableTickets = event.categories.reduce((sum, cat) => sum + cat.mintAddresses.length, 0);
        const revenue = categoryBreakdown.reduce((sum, cat) => sum + cat.revenue, 0);

        return {
            totalTickets,
            soldTickets,
            availableTickets,
            revenue,
            categoryBreakdown
        };
    } catch (error) {
        console.error('Error getting event statistics:', error);
        return {
            totalTickets: 0,
            soldTickets: 0,
            availableTickets: 0,
            revenue: 0,
            categoryBreakdown: []
        };
    }
}

// Admin function to get admin wallet NFTs
async function getAdminWalletNFTs(): Promise<Array<{
    mint: string;
    name: string;
    type: 'ticket' | 'collectible';
    eventDetails?: any;
}>> {
    try {
        const adminPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATEKEY;
        if (!adminPrivateKey) {
            throw new Error('Admin private key not configured');
        }

        // Get admin wallet address from private key
        const { Keypair } = await import('@solana/web3.js');
        const adminKeypair = Keypair.fromSecretKey(
            Uint8Array.from(Buffer.from(adminPrivateKey, 'hex'))
        );
        const adminAddress = adminKeypair.publicKey.toString();

        const adminNFTs = await getUserNFTs(adminAddress);
        
        return adminNFTs.map(nft => ({
            mint: nft.mint,
            name: nft.name,
            type: nft.isEventTicket ? 'ticket' : 'collectible',
            eventDetails: nft.eventDetails
        }));
    } catch (error) {
        console.error('Error getting admin wallet NFTs:', error);
        throw error;
    }
}

// Admin function to debug event NFTs
async function debugEventNFTs(eventId: string): Promise<{
    eventName: string;
    totalMinted: number;
    totalAvailable: number;
    totalSold: number;
    categories: Array<{
        category: string;
        price: number;
        minted: number;
        available: number;
        sold: number;
        mintAddresses: string[];
    }>;
}> {
    try {
        const event = await Event.findOne({ eventId });
        if (!event) {
            throw new Error('Event not found');
        }

        const result = {
            eventName: event.name,
            totalMinted: 0,
            totalAvailable: 0,
            totalSold: 0,
            categories: [] as any[]
        };

        event.categories.forEach(cat => {
            const minted = cat.maxSupply;
            const available = cat.mintAddresses.length;
            const sold = minted - available;

            result.totalMinted += minted;
            result.totalAvailable += available;
            result.totalSold += sold;

            result.categories.push({
                category: cat.category,
                price: cat.price,
                minted,
                available,
                sold,
                mintAddresses: cat.mintAddresses
            });
        });

        return result;
    } catch (error) {
        console.error('Error debugging event NFTs:', error);
        throw error;
    }
}

// Transfer NFT between users
async function transferNFTBetweenUsers(
    fromTelegramId: number,
    toTelegramId: number,
    mintAddress: string
): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        // Validate inputs
        if (!fromTelegramId || !toTelegramId || !mintAddress) {
            throw new Error('Missing required parameters');
        }

        if (fromTelegramId === toTelegramId) {
            throw new Error('Cannot transfer NFT to yourself');
        }

        // Get sender wallet
        const fromWallet = await getUserWallet(fromTelegramId);
        if (!fromWallet) {
            throw new Error('Sender wallet not found');
        }

        // Get recipient wallet
        const toWallet = await getUserWallet(toTelegramId);
        if (!toWallet) {
            throw new Error('Recipient wallet not found');
        }

        // Verify sender owns the NFT
        const nftMetadata = await getNFTMetadata(mintAddress);
        if (!nftMetadata) {
            throw new Error('NFT not found');
        }

        // Check if NFT is an event ticket that's already used
        if (nftMetadata.isEventTicket && nftMetadata.eventDetails?.isUsed) {
            throw new Error('Cannot transfer used event tickets');
        }

        // Check if NFT is listed for sale
        const activeListing = await NFTListing.findOne({
            mintAddress,
            isActive: true
        });
        if (activeListing) {
            throw new Error('Cannot transfer NFT that is listed for sale. Please cancel the listing first.');
        }

        // Transfer NFT using admin private key
        // Note: In a real implementation, you'd use the sender's private key
        const adminPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATEKEY;
        if (!adminPrivateKey) {
            throw new Error('Admin private key not configured. Please contact support.');
        }

        console.log(`🔄 Transferring NFT ${mintAddress} from user ${fromTelegramId} to user ${toTelegramId}`);

        const transferSuccess = await transferNFTToUser(mintAddress, toWallet.address, adminPrivateKey);
        
        if (!transferSuccess) {
            throw new Error('Failed to transfer NFT');
        }

        // Update purchase record if this is an event ticket
        const purchase = await TicketPurchase.findOne({
            telegramId: fromTelegramId,
            mintAddress
        });

        if (purchase) {
            purchase.telegramId = toTelegramId;
            await purchase.save();
            console.log(`📝 Updated purchase record for NFT ${mintAddress}`);
        }

        console.log(`✅ NFT transferred successfully: ${mintAddress} from ${fromTelegramId} to ${toTelegramId}`);
        
        return { success: true };
    } catch (error) {
        console.error('Error transferring NFT between users:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Get NFT transfer history
async function getNFTTransferHistory(mintAddress: string): Promise<{
    success: boolean;
    transfers?: Array<{
        from: number;
        to: number;
        timestamp: Date;
        type: 'purchase' | 'transfer' | 'resale';
    }>;
    error?: string;
}> {
    try {
        if (!mintAddress) {
            throw new Error('Mint address is required');
        }

        const transfers = [];

        // Get purchase records
        const purchases = await TicketPurchase.find({ mintAddress }).sort({ purchasedAt: -1 });
        for (const purchase of purchases) {
            transfers.push({
                from: 0, // System/admin
                to: purchase.telegramId,
                timestamp: purchase.purchasedAt,
                type: 'purchase' as const
            });
        }

        // Get resale records
        const resales = await NFTResale.find({ mintAddress }).sort({ timestamp: -1 });
        for (const resale of resales) {
            transfers.push({
                from: resale.sellerTelegramId,
                to: resale.buyerTelegramId,
                timestamp: resale.timestamp,
                type: 'resale' as const
            });
        }

        // Sort by timestamp
        transfers.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        return {
            success: true,
            transfers
        };
    } catch (error) {
        console.error('Error getting NFT transfer history:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Bulk operations for NFTs
async function bulkUpdateNFTStatus(
    mintAddresses: string[],
    updates: {
        isUsed?: boolean;
        isListed?: boolean;
        price?: number;
    }
): Promise<{
    success: boolean;
    updated: number;
    failed: number;
    errors: string[];
}> {
    try {
        if (!mintAddresses || mintAddresses.length === 0) {
            throw new Error('No mint addresses provided');
        }

        let updated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const mintAddress of mintAddresses) {
            try {
                // Update purchase records if this is an event ticket
                const purchase = await TicketPurchase.findOne({ mintAddress });
                if (purchase && updates.isUsed !== undefined) {
                    purchase.isUsed = updates.isUsed;
                    if (updates.isUsed) {
                        purchase.usedAt = new Date();
                    }
                    await purchase.save();
                }

                // Update listing status if needed
                if (updates.isListed !== undefined) {
                    const listing = await NFTListing.findOne({ mintAddress });
                    if (listing) {
                        listing.isActive = updates.isListed;
                        if (updates.price !== undefined) {
                            listing.price = updates.price;
                        }
                        await listing.save();
                    }
                }

                updated++;
            } catch (error) {
                failed++;
                errors.push(`Failed to update ${mintAddress}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        return {
            success: failed === 0,
            updated,
            failed,
            errors
        };
    } catch (error) {
        console.error('Error in bulk NFT update:', error);
        return {
            success: false,
            updated: 0,
            failed: mintAddresses.length,
            errors: [error instanceof Error ? error.message : 'Unknown error']
        };
    }
}

// Get comprehensive NFT analytics
async function getNFTAnalytics(eventId?: string): Promise<{
    success: boolean;
    analytics?: {
        totalNFTs: number;
        eventTickets: number;
        collectibles: number;
        totalListings: number;
        activeListings: number;
        totalResales: number;
        totalRevenue: number;
        eventBreakdown?: Array<{
            eventId: string;
            eventName: string;
            totalTickets: number;
            soldTickets: number;
            availableTickets: number;
            revenue: number;
        }>;
    };
    error?: string;
}> {
    try {
        // Get total NFTs
        const totalNFTs = await TicketPurchase.countDocuments();
        
        // Get event tickets vs collectibles
        const eventTickets = await TicketPurchase.countDocuments();
        const collectibles = totalNFTs - eventTickets; // This is a simplified calculation
        
        // Get marketplace stats
        const totalListings = await NFTListing.countDocuments();
        const activeListings = await NFTListing.countDocuments({ isActive: true });
        
        // Get resale stats
        const totalResales = await NFTResale.countDocuments();
        
        // Calculate revenue
        const purchases = await TicketPurchase.find();
        const totalRevenue = purchases.reduce((sum, purchase) => sum + purchase.price, 0);
        
        // Get event breakdown if eventId is provided
        let eventBreakdown;
        if (eventId) {
            const event = await Event.findOne({ eventId });
            if (event) {
                const eventPurchases = await TicketPurchase.find({ eventId });
                const eventRevenue = eventPurchases.reduce((sum, purchase) => sum + purchase.price, 0);
                
                eventBreakdown = [{
                    eventId: event.eventId,
                    eventName: event.name,
                    totalTickets: event.categories.reduce((sum, cat) => sum + cat.maxSupply, 0),
                    soldTickets: eventPurchases.length,
                    availableTickets: event.categories.reduce((sum, cat) => sum + cat.mintAddresses.length, 0),
                    revenue: eventRevenue
                }];
            }
        }

        return {
            success: true,
            analytics: {
                totalNFTs,
                eventTickets,
                collectibles,
                totalListings,
                activeListings,
                totalResales,
                totalRevenue,
                eventBreakdown
            }
        };
    } catch (error) {
        console.error('Error getting NFT analytics:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Clean up expired listings
async function cleanupExpiredListings(): Promise<{
    success: boolean;
    cleaned: number;
    error?: string;
}> {
    try {
        const now = new Date();
        const expiredListings = await NFTListing.find({
            isActive: true,
            endTime: { $lt: now }
        });

        let cleaned = 0;
        for (const listing of expiredListings) {
            listing.isActive = false;
            await listing.save();
            cleaned++;
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} expired listings`);
        }

        return {
            success: true,
            cleaned
        };
    } catch (error) {
        console.error('Error cleaning up expired listings:', error);
        return {
            success: false,
            cleaned: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Export all functions for easy access
export {
    // Core NFT functions
    getNFTDetails,
    getUserNFTsWithFilters,
    getAllEvents,
    getEvent,
    createEvent,
    purchaseTicket,
    validateTicketForEntry,
    useTicketForEntry,
    getUserTicketPurchases,
    mintCustomNFT,
    
    // Marketplace functions
    listNFTForSale,
    getActiveNFTListings,
    getNFTListingsBySeller,
    buyNFTFromMarketplace,
    cancelNFTListing,
    getNFTResaleHistory,
    
    // Event management
    getAvailableTickets,
    getEventsWithTicketAvailability,
    getEventStatistics,
    getAdminWalletNFTs,
    debugEventNFTs,
    
    // Transfer and management
    transferNFTBetweenUsers,
    getNFTTransferHistory,
    bulkUpdateNFTStatus,
    getNFTAnalytics,
    cleanupExpiredListings,
    
    // Admin functions
    isAdmin,
    
    // Interfaces
    NFTEvent,
    TicketPurchaseData,
    NFTListing,
    NFTResale
};

// Utility function to check if NFT is available for listing
async function isNFTAvailableForListing(
    mintAddress: string,
    sellerTelegramId: number
): Promise<{
    available: boolean;
    reason?: string;
}> {
    try {
        // Check if NFT exists
        const nftMetadata = await getNFTMetadata(mintAddress);
        if (!nftMetadata) {
            return { available: false, reason: 'NFT not found' };
        }

        // Check if NFT is already listed
        const existingListing = await NFTListing.findOne({
            mintAddress,
            isActive: true
        });
        if (existingListing) {
            return { available: false, reason: 'NFT is already listed for sale' };
        }

        // Check if NFT is an event ticket that's already used
        if (nftMetadata.isEventTicket && nftMetadata.eventDetails?.isUsed) {
            return { available: false, reason: 'Cannot list used event tickets' };
        }

        // Check if user owns the NFT
        const purchase = await TicketPurchase.findOne({
            telegramId: sellerTelegramId,
            mintAddress
        });
        if (!purchase) {
            return { available: false, reason: 'You do not own this NFT' };
        }

        return { available: true };
    } catch (error) {
        console.error('Error checking NFT availability for listing:', error);
        return { available: false, reason: 'Error checking availability' };
    }
}

// Function to get user's NFT portfolio summary
async function getUserNFTPortfolio(telegramId: number): Promise<{
    success: boolean;
    portfolio?: {
        totalNFTs: number;
        eventTickets: number;
        collectibles: number;
        activeListings: number;
        totalValue: number;
        recentActivity: Array<{
            type: 'purchase' | 'listing' | 'sale' | 'transfer';
            timestamp: Date;
            details: string;
        }>;
    };
    error?: string;
}> {
    try {
        if (!telegramId) {
            throw new Error('Telegram ID is required');
        }

        // Get user's NFTs
        const nfts = await getUserNFTsWithFilters(telegramId);
        
        // Get user's active listings
        const activeListings = await getNFTListingsBySeller(telegramId);
        
        // Get recent purchases
        const recentPurchases = await TicketPurchase.find({ telegramId })
            .sort({ purchasedAt: -1 })
            .limit(5);
        
        // Get recent listings
        const recentListings = await NFTListing.find({ sellerTelegramId: telegramId })
            .sort({ startTime: -1 })
            .limit(5);
        
        // Calculate total value (simplified - in real implementation, you'd get current market prices)
        const totalValue = nfts.nfts.reduce((sum, nft) => {
            // For event tickets, use purchase price; for collectibles, estimate market value
            if (nft.isEventTicket) {
                const purchase = recentPurchases.find(p => p.mintAddress === nft.mint);
                return sum + (purchase?.price || 0);
            } else {
                // Estimate collectible value (in real implementation, get from marketplace)
                return sum + 1; // Placeholder value
            }
        }, 0);
        
        // Build recent activity
        const recentActivity = [];
        
        for (const purchase of recentPurchases) {
            recentActivity.push({
                type: 'purchase' as const,
                timestamp: purchase.purchasedAt,
                details: `Purchased ${purchase.category} ticket for event`
            });
        }
        
        for (const listing of recentListings) {
            recentActivity.push({
                type: 'listing' as const,
                timestamp: listing.startTime,
                details: `Listed NFT for ${listing.price} SOL`
            });
        }
        
        // Sort by timestamp
        recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        return {
            success: true,
            portfolio: {
                totalNFTs: nfts.totalCount,
                eventTickets: nfts.ticketCount,
                collectibles: nfts.collectibleCount,
                activeListings: activeListings.filter(l => l.isActive).length,
                totalValue,
                recentActivity: recentActivity.slice(0, 10) // Limit to 10 most recent
            }
        };
    } catch (error) {
        console.error('Error getting user NFT portfolio:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
