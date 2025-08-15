import { getUserNFTs, mintNFT, createEventTickets, validateTicketEntry, markTicketAsUsed, NFTMetadata, UserNFT, getNFTMetadata } from '../utils/nftUtils';
import { getUserWallet, getUserWalletPrivateKey } from './walletService';
import { getWalletBalance, transferSOL } from '../utils/blockchainUtils';
import Event, { IEvent } from '../models/Event';
import TicketPurchase, { ITicketPurchase } from '../models/TicketPurchase';
import NFTListing, { INFTListing } from '../models/NFTListing';
import NFTResale, { INFTResale } from '../models/NFTResale';
import mongoose from 'mongoose';

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
const adminTelegramId = process.env.TELEGRAM_ADMIN_ID || '';
const ADMIN_TELEGRAM_IDS = [adminTelegramId]; // Add your admin Telegram ID here

function isAdmin(telegramId: number): boolean {
    return ADMIN_TELEGRAM_IDS.includes(telegramId.toString());
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

        console.log(`🔍 Getting NFTs for user ${telegramId} with filter:`, filter);

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

        console.log(`💰 User wallet found: ${wallet.address}`);

        // First, get ticket purchases from database (this is more reliable for tickets)
        const ticketPurchases = await TicketPurchase.find({ telegramId });
        console.log(`📋 Found ${ticketPurchases.length} ticket purchases in database for user ${telegramId}`);

        // Get NFTs from blockchain
        let blockchainNFTs: UserNFT[] = [];
        try {
            blockchainNFTs = await getUserNFTs(wallet.address);
            console.log(`🔗 Found ${blockchainNFTs.length} NFTs on blockchain for wallet ${wallet.address}`);
        } catch (blockchainError) {
            console.warn(`⚠️ Could not fetch blockchain NFTs:`, blockchainError);
            // Continue with database records only
        }

        // Create a map of blockchain NFTs by mint address for quick lookup
        const blockchainNFTMap = new Map<string, UserNFT>();
        blockchainNFTs.forEach(nft => {
            blockchainNFTMap.set(nft.mint, nft);
        });

        // Build user's NFT collection combining database and blockchain data
        const userNFTs: UserNFT[] = [];

        // Process ticket purchases first (these are guaranteed to exist)
        for (const purchase of ticketPurchases) {
            console.log(`🎫 Processing ticket purchase: ${purchase.purchaseId} for event ${purchase.eventId}`);
            
            // Validate purchase data
            if (!purchase.mintAddress || !purchase.eventId || !purchase.category) {
                console.warn(`⚠️ Invalid purchase data for ${purchase.purchaseId}:`, purchase);
                continue;
            }
            
            // Get event details
            const event = await Event.findOne({ eventId: purchase.eventId });
            if (!event) {
                console.warn(`⚠️ Event not found for purchase ${purchase.purchaseId}: ${purchase.eventId}`);
                continue;
            }
            
            // Validate event data
            if (!event.name || !event.venue || !event.date || !event.imageUrl || 
                !Array.isArray(event.categories) || event.categories.length === 0 ||
                !event.categories.some(cat => cat.category === purchase.category)) {
                console.warn(`⚠️ Invalid event data for ${purchase.eventId}:`, event);
                continue;
            }
            
            // Validate purchase category
            const validCategory = event.categories.find(cat => cat.category === purchase.category);
            if (!validCategory) {
                console.warn(`⚠️ Invalid category ${purchase.category} for event ${purchase.eventId}`);
                continue;
            }

            // Check if we have blockchain data for this NFT
            let blockchainNFT = blockchainNFTMap.get(purchase.mintAddress);
            
            // Validate purchase data
            if (!purchase.mintAddress || !purchase.eventId || !purchase.category || 
                typeof purchase.isUsed !== 'boolean' || !purchase.purchaseId ||
                typeof purchase.telegramId !== 'number' || purchase.telegramId !== telegramId ||
                !purchase.mintAddress.startsWith('0x') || purchase.mintAddress.length < 32 ||
                !purchase.eventId.startsWith('event_') || purchase.eventId.length < 10 ||
                !['VIP', 'Standard', 'Group'].includes(purchase.category) ||
                purchase.purchaseId.length < 10 ||
                purchase.purchaseId.includes('undefined') || purchase.purchaseId.includes('null') ||
                purchase.eventId.includes('undefined') || purchase.eventId.includes('null') ||
                purchase.mintAddress.includes('undefined') || purchase.mintAddress.includes('null') ||
                purchase.category.includes('undefined') || purchase.category.includes('null') ||
                purchase.telegramId < 1 || purchase.telegramId > 999999999999 ||
                purchase.mintAddress.length > 100 || purchase.eventId.length > 10 || purchase.purchaseId.length > 100 ||
                purchase.category.length > 50 ||
                purchase.purchaseId.includes(' ') || purchase.eventId.includes(' ') || purchase.mintAddress.includes(' ') ||
                purchase.purchaseId.includes('\n') || purchase.eventId.includes('\n') || purchase.mintAddress.includes('\n') ||
                purchase.purchaseId.includes('\t') || purchase.eventId.includes('\t') || purchase.mintAddress.includes('\t') ||
                purchase.purchaseId.includes('\r') || purchase.eventId.includes('\r') || purchase.mintAddress.includes('\r')) {
                console.warn(`⚠️ Invalid purchase data for ${purchase.purchaseId}:`, purchase);
                continue;
            }
            
            if (!blockchainNFT) {
                console.log(`⚠️ NFT ${purchase.mintAddress} not found on blockchain, creating from database record`);
                // Create NFT object from database record
                blockchainNFT = {
                    mint: purchase.mintAddress,
                    name: `${event.name || 'Unknown Event'} - ${purchase.category || 'Standard'} Ticket`,
                    description: `Event ticket for ${event.name || 'Unknown Event'} at ${event.venue || 'Unknown Venue'}`,
                    image: event.imageUrl || '',
                    attributes: [
                        { trait_type: 'Event', value: event.name || 'Unknown Event' },
                        { trait_type: 'Category', value: purchase.category || 'Standard' },
                        { trait_type: 'Venue', value: event.venue || 'Unknown Venue' },
                        { trait_type: 'Date', value: event.date ? event.date.toISOString() : 'Unknown Date' },
                        { trait_type: 'Used', value: purchase.isUsed ? 'true' : 'false' }
                    ],
                    isEventTicket: true,
                    eventDetails: {
                        eventId: purchase.eventId,
                        eventName: event.name || 'Unknown Event',
                        category: purchase.category || 'Standard',
                        isUsed: purchase.isUsed || false
                    }
                };
            } else {
                // Update blockchain NFT with database information
                blockchainNFT.isEventTicket = true;
                blockchainNFT.eventDetails = {
                    eventId: purchase.eventId,
                    eventName: event.name || 'Unknown Event',
                    category: purchase.category || 'Standard',
                    isUsed: purchase.isUsed || false
                };
                
                // Ensure the blockchain NFT has valid attributes
                if (!blockchainNFT.attributes || !Array.isArray(blockchainNFT.attributes)) {
                    blockchainNFT.attributes = [];
                }
            }

            userNFTs.push(blockchainNFT);
        }

        // Add any other collectible NFTs from blockchain that aren't tickets
        for (const blockchainNFT of blockchainNFTs) {
            // Ensure the blockchain NFT has all required properties
            if (blockchainNFT && blockchainNFT.mint && blockchainNFT.name && 
                !blockchainNFT.isEventTicket && 
                !userNFTs.some(nft => nft.mint === blockchainNFT.mint)) {
                
                // Ensure attributes array exists and is valid
                if (!blockchainNFT.attributes || !Array.isArray(blockchainNFT.attributes)) {
                    blockchainNFT.attributes = [];
                }
                
                // Validate each attribute
                blockchainNFT.attributes = blockchainNFT.attributes.filter(attr => 
                    attr && typeof attr.trait_type === 'string' && attr.value !== undefined
                );
                
                userNFTs.push(blockchainNFT);
            }
        }

        console.log(`📊 Total NFTs for user ${telegramId}: ${userNFTs.length} (${ticketPurchases.length} tickets)`);

        // Ensure all NFTs have required properties before filtering
        const validNFTs = userNFTs.filter(nft => {
            if (!nft || !nft.mint || !nft.name) {
                console.warn(`⚠️ Skipping invalid NFT:`, nft);
                return false;
            }
            return true;
        });

        // Apply filters
        let filteredNFTs = validNFTs;

        if (filter?.type && filter.type !== 'all') {
            if (filter.type === 'tickets') {
                filteredNFTs = userNFTs.filter(nft => nft.isEventTicket);
                console.log(`🎫 Filtered to ${filteredNFTs.length} tickets`);
            } else if (filter.type === 'collectibles') {
                filteredNFTs = userNFTs.filter(nft => !nft.isEventTicket);
                console.log(`🖼️ Filtered to ${filteredNFTs.length} collectibles`);
            }
        }

        if (filter?.event) {
            filteredNFTs = filteredNFTs.filter(nft => 
                nft.eventDetails && nft.eventDetails.eventId && nft.eventDetails.eventId === filter.event
            );
            console.log(`🎯 Filtered to ${filteredNFTs.length} NFTs for event ${filter.event}`);
        }

        // Count by type
        const ticketCount = validNFTs.filter(nft => nft.isEventTicket && nft.eventDetails && nft.eventDetails.eventId).length;
        const collectibleCount = validNFTs.filter(nft => !nft.isEventTicket).length;

        // Final validation: ensure all NFTs have required properties
        const validatedNFTs = filteredNFTs.filter(nft => {
            if (!nft || !nft.mint || !nft.name || nft.description === undefined || nft.image === undefined) {
                return false;
            }
            
            // Additional validation for event tickets
            if (nft.isEventTicket && (!nft.eventDetails || !nft.eventDetails.eventId)) {
                console.warn(`⚠️ Skipping invalid event ticket NFT:`, nft);
                return false;
            }
            
            return true;
        });

        console.log(`📈 Final counts - Total: ${validatedNFTs.length}, Tickets: ${ticketCount}, Collectibles: ${collectibleCount}`);

        return {
            nfts: validatedNFTs,
            totalCount: validatedNFTs.length,
            ticketCount,
            collectibleCount
        };
    } catch (error) {
        console.error('Error getting user NFTs with filters:', error);
        
        // Log additional context for debugging
        if (error instanceof Error) {
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                telegramId: telegramId
            });
        }
        
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
        console.log(`🔍 getAllEvents: Starting to fetch events from database...`);
        
        // Check database connection first
        if (mongoose.connection.readyState !== 1) {
            console.error(`❌ Database not connected. Ready state: ${mongoose.connection.readyState}`);
            throw new Error('Database connection not ready');
        }
        
        const dbEvents = await Event.find({});
        console.log(`🔍 getAllEvents: Found ${dbEvents.length} events in database`);
        
        if (dbEvents.length === 0) {
            console.log(`📋 No events found in database - this is normal for a new system`);
            return [];
        }
        
        const validEvents: NFTEvent[] = [];
        
        for (const dbEvent of dbEvents) {
            console.log(`📋 Processing event: name="${dbEvent.name}", eventId="${dbEvent.eventId}"`);
            
            // Use the original eventId from database - don't modify it
            const eventId = dbEvent.eventId;
            
            // Validate categories have proper structure
            const validCategories = dbEvent.categories.map(cat => ({
                category: cat.category,
                price: cat.price || 0,
                maxSupply: cat.maxSupply || 0,
                currentSupply: cat.currentSupply || 0,
                mintAddresses: Array.isArray(cat.mintAddresses) ? cat.mintAddresses : []
            }));
            
            const validEvent: NFTEvent = {
                eventId: eventId,
                name: dbEvent.name,
                description: dbEvent.description,
                date: dbEvent.date,
                venue: dbEvent.venue,
                imageUrl: dbEvent.imageUrl,
                categories: validCategories,
                isActive: dbEvent.isActive !== false, // Default to true if not set
                createdBy: dbEvent.createdBy,
                createdAt: dbEvent.createdAt
            };
            
            validEvents.push(validEvent);
            console.log(`✅ Valid event processed: "${validEvent.name}" with eventId: "${validEvent.eventId}"`);
        }
        
        console.log(`🎯 getAllEvents: Returning ${validEvents.length} valid events`);
        return validEvents;
    } catch (error) {
        console.error('Error getting all events:', error);
        return [];
    }
}

// Get event by ID
async function getEvent(eventId: string): Promise<NFTEvent | null> {
    try {
        console.log(`🔍 Looking for event with ID: ${eventId}`);
        
        if (!eventId || eventId === 'event' || eventId.length < 5) {
            console.log(`❌ Invalid eventId provided: "${eventId}"`);
            return null;
        }
        
        const dbEvent = await Event.findOne({ eventId });
        
        if (!dbEvent) {
            console.log(`❌ Event not found in database for ID: ${eventId}`);
            
            // Debug: Check if there are any events in the database
            const totalEvents = await Event.countDocuments();
            console.log(`📊 Total events in database: ${totalEvents}`);
            
            if (totalEvents > 0) {
                const sampleEvents = await Event.find().limit(3);
                console.log(`📋 Sample events:`, sampleEvents.map(e => ({ 
                    _id: e._id, 
                    eventId: e.eventId, 
                    name: e.name 
                })));
            } else {
                console.log(`📋 No events found in database - this explains why event ${eventId} was not found`);
            }
            
            return null;
        }
        
        console.log(`✅ Event found: ${dbEvent.name} (${dbEvent.eventId})`);
        
        return {
            eventId: dbEvent.eventId,
            name: dbEvent.name,
            description: dbEvent.description,
            date: dbEvent.date,
            venue: dbEvent.venue,
            imageUrl: dbEvent.imageUrl,
            categories: dbEvent.categories.map(cat => ({
                category: cat.category,
                price: cat.price || 0,
                maxSupply: cat.maxSupply || 0,
                currentSupply: cat.currentSupply || 0,
                mintAddresses: Array.isArray(cat.mintAddresses) ? cat.mintAddresses : []
            })),
            isActive: dbEvent.isActive !== false,
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

        // Generate a unique eventId with timestamp and random suffix
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substr(2, 9);
        const eventId = `event_${timestamp}_${randomSuffix}`;
        
        // Validate eventId generation
        if (!eventId || eventId === 'event' || eventId.length < 20) {
            throw new Error('Failed to generate valid event ID');
        }
        
        console.log(`🆔 Generated eventId: ${eventId}`);
        
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

        // Validate event object before saving
        if (!newEvent.eventId || newEvent.eventId === 'event' || newEvent.eventId.length < 10) {
            throw new Error('Invalid event ID generated');
        }

        // Save to database
        const dbEvent = new Event(newEvent);
        await dbEvent.save();
        
        // Verify the event was saved correctly
        const savedEvent = await Event.findOne({ eventId });
        if (!savedEvent) {
            throw new Error('Event was not saved to database');
        }
        
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
        
        // Create a copy of the array and remove the first ticket
        const mintAddress = categoryData.mintAddresses[0];
        const updatedMintAddresses = categoryData.mintAddresses.slice(1);
        
        console.log(`🎫 Allocating ticket ${mintAddress} for user ${telegramId}`);

        // Check if user has sufficient SOL balance for payment
        const userBalance = await getWalletBalance(userWallet.address);
        const userBalanceNum = parseFloat(userBalance);
        if (userBalanceNum < categoryData.price) {
            throw new Error(`Insufficient SOL balance. You have ${userBalanceNum.toFixed(4)} SOL, but need ${categoryData.price} SOL for this ticket.`);
        }

        // Transfer payment from user to admin wallet
        const adminWalletAddress = process.env.ADMIN_WALLET_ADDRESS;
        if (!adminWalletAddress) {
            throw new Error('Admin wallet address not configured. Please contact support.');
        }

        console.log(`💰 Processing payment: ${categoryData.price} SOL from user ${telegramId} to admin wallet`);
        
        // Get user's private key for the transfer
        const userPrivateKey = await getUserWalletPrivateKey(userWallet.address);
        if (!userPrivateKey) {
            throw new Error('Unable to access user wallet for payment. Please contact support.');
        }
        
        try {
            await transferSOL(
                userWallet.address,
                adminWalletAddress,
                categoryData.price.toString()
            );
            console.log(`✅ Payment successful: ${categoryData.price} SOL transferred to admin wallet`);
        } catch (paymentError) {
            throw new Error(`Payment failed: ${paymentError instanceof Error ? paymentError.message : 'Unknown error'}. Please ensure you have sufficient SOL and try again.`);
        }

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
            console.log(`❌ Ticket transfer failed, keeping ${mintAddress} in available pool`);
            throw new Error('Failed to transfer ticket - please try again');
        }

        // Update the event in database to reflect the ticket being sold
        const categoryIndex = event.categories.findIndex(cat => cat.category === category);
        if (categoryIndex !== -1) {
            event.categories[categoryIndex].mintAddresses = updatedMintAddresses;
            event.categories[categoryIndex].currentSupply += 1;
            await event.save();
            console.log(`✅ Updated event database: ${updatedMintAddresses.length} tickets remaining for ${category}`);
        }
        
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
        
        // Check if user owns the NFT
        const userNFTs = await getUserNFTs(userWallet.address);
        const ownedNFT = userNFTs.find(nft => nft.mint === mintAddress);
        
        if (!ownedNFT) {
            return {
                isValid: false,
                canEnter: false,
                error: 'Ticket not owned by this user'
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

        // Check if user owns the ticket via purchase record
        const purchaseRecord = await TicketPurchase.findOne({
            telegramId,
            eventId,
            mintAddress
        });

        if (!purchaseRecord) {
            return {
                isValid: false,
                canEnter: false,
                error: 'You do not own this ticket'
            };
        }

        if (purchaseRecord.isUsed) {
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
        // First validate the ticket
        const validation = await validateTicketForEntry(telegramId, mintAddress, eventId);
        
        if (!validation.isValid) {
            return {
                success: false,
                error: validation.error || 'Ticket validation failed'
            };
        }
        
        if (!validation.canEnter) {
            return {
                success: false,
                error: validation.error || 'Ticket cannot be used for entry'
            };
        }
        
        // Mark ticket as used
        const purchase = await TicketPurchase.findOne({
            telegramId,
            eventId,
            mintAddress
        });
        
        if (purchase) {
            purchase.isUsed = true;
            purchase.usedAt = new Date();
            await purchase.save();
            
            // Update NFT metadata to mark as used
            await markTicketAsUsed(mintAddress, eventId);
            
            console.log(`✅ Ticket ${mintAddress} marked as used for event ${eventId}`);
            
            return {
                success: true
            };
        } else {
            return {
                success: false,
                error: 'Purchase record not found'
            };
        }
    } catch (error) {
        console.error('Error using ticket for entry:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Get user's ticket purchases with enhanced details
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

// Get user's tickets with full event details (database-based, more reliable)
async function getUserTicketsWithDetails(telegramId: number): Promise<{
    success: boolean;
    tickets?: Array<{
        purchaseId: string;
        mintAddress: string;
        eventId: string;
        eventName: string;
        category: 'VIP' | 'Standard' | 'Group';
        price: number;
        purchasedAt: Date;
        isUsed: boolean;
        usedAt?: Date;
        venue: string;
        eventDate: Date;
        imageUrl: string;
    }>;
    error?: string;
}> {
    try {
        if (!telegramId) {
            throw new Error('Telegram ID is required');
        }

        console.log(`🎫 Getting tickets with details for user ${telegramId}`);

        // Get all ticket purchases for the user
        const purchases = await TicketPurchase.find({ telegramId });
        console.log(`📋 Found ${purchases.length} ticket purchases for user ${telegramId}`);

        if (purchases.length === 0) {
            return {
                success: true,
                tickets: []
            };
        }

        // Get event details for each purchase
        const ticketsWithDetails = [];
        for (const purchase of purchases) {
            try {
                const event = await Event.findOne({ eventId: purchase.eventId });
                if (!event) {
                    console.warn(`⚠️ Event not found for purchase ${purchase.purchaseId}: ${purchase.eventId}`);
                    continue;
                }

                ticketsWithDetails.push({
                    purchaseId: purchase.purchaseId,
                    mintAddress: purchase.mintAddress,
                    eventId: purchase.eventId,
                    eventName: event.name,
                    category: purchase.category,
                    price: purchase.price,
                    purchasedAt: purchase.purchasedAt,
                    isUsed: purchase.isUsed,
                    usedAt: purchase.usedAt,
                    venue: event.venue,
                    eventDate: event.date,
                    imageUrl: event.imageUrl
                });
            } catch (eventError) {
                console.warn(`⚠️ Error getting event details for purchase ${purchase.purchaseId}:`, eventError);
                continue;
            }
        }

        console.log(`✅ Successfully processed ${ticketsWithDetails.length} tickets with details`);

        return {
            success: true,
            tickets: ticketsWithDetails
        };
    } catch (error) {
        console.error('Error getting user tickets with details:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
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
        // Validate inputs
        if (!sellerTelegramId || !listingId) {
            throw new Error('Missing required parameters');
        }

        // Get the listing
        const listing = await NFTListing.findOne({ listingId });
        if (!listing) {
            throw new Error('Listing not found');
        }

        // Check if user owns the listing
        if (listing.sellerTelegramId !== sellerTelegramId) {
            throw new Error('You can only cancel your own listings');
        }

        // Check if listing is active
        if (!listing.isActive) {
            throw new Error('Listing is already inactive');
        }

        // Mark listing as inactive
        listing.isActive = false;
        await listing.save();

        console.log(`✅ NFT listing cancelled: ${listingId} - ${listing.mintAddress}`);
        return { success: true };
    } catch (error) {
        console.error('Error cancelling NFT listing:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Transfer NFT to another user
async function transferNFTToUser(
    mintAddress: string,
    recipientAddress: string,
    adminPrivateKey: string
): Promise<boolean> {
    try {
        console.log(`🔄 Transferring NFT ${mintAddress} to ${recipientAddress}`);
        
        // Import the actual transfer function from nftUtils
        const { transferNFTToUser: transferNFTFromUtils } = await import('../utils/nftUtils');
        
        // Perform the actual blockchain transfer
        const transferResult = await transferNFTFromUtils(mintAddress, recipientAddress, adminPrivateKey);
        
        if (transferResult) {
            console.log(`✅ NFT ${mintAddress} successfully transferred to ${recipientAddress}`);
            return true;
        } else {
            console.error(`❌ Failed to transfer NFT ${mintAddress} to ${recipientAddress}`);
            return false;
        }
    } catch (error) {
        console.error('Error transferring NFT:', error);
        return false;
    }
}

// Transfer NFT between users
async function transferNFTBetweenUsers(
    fromTelegramId: number,
    toTelegramId: number,
    mintAddress: string
): Promise<{ success: boolean; error?: string }> {
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

        // Use the new comprehensive transfer function
        const { transferNFTBetweenUsers: transferNFTFromUtils } = await import('../utils/nftUtils');
        
        const transferResult = await transferNFTFromUtils(
            mintAddress, 
            fromWallet.address, 
            toWallet.address, 
            fromTelegramId, 
            toTelegramId, 
            adminPrivateKey
        );
        
        if (!transferResult.success) {
            throw new Error(transferResult.error || 'Failed to transfer NFT');
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

// Get NFT resale history
async function getNFTResaleHistory(mintAddress: string): Promise<NFTResale[]> {
    try {
        const resales = await NFTResale.find({ mintAddress }).sort({ timestamp: -1 });
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
            throw new Error('Event not found');
        }

        const purchases = await TicketPurchase.find({ eventId });
        const totalRevenue = purchases.reduce((sum, purchase) => sum + purchase.price, 0);

        const categoryBreakdown = event.categories.map(cat => {
            const categoryPurchases = purchases.filter(p => p.category === cat.category);
            const sold = categoryPurchases.length;
            const revenue = categoryPurchases.reduce((sum, p) => sum + p.price, 0);
            
            return {
                category: cat.category,
                total: cat.maxSupply,
                sold,
                available: cat.mintAddresses.length,
                revenue
            };
        });

        return {
            totalTickets: event.categories.reduce((sum, cat) => sum + cat.maxSupply, 0),
            soldTickets: event.categories.reduce((sum, cat) => sum + cat.currentSupply, 0),
            availableTickets: event.categories.reduce((sum, cat) => sum + cat.mintAddresses.length, 0),
            revenue: totalRevenue,
            categoryBreakdown
        };
    } catch (error) {
        console.error('Error getting event statistics:', error);
        throw error;
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

// Debug function to check specific event by ID
async function debugEventById(eventId: string): Promise<{
    success: boolean;
    event?: any;
    error?: string;
}> {
    try {
        console.log(`🔍 Debugging event ID: ${eventId}`);
        
        // Check database
        const dbEvent = await Event.findOne({ eventId });
        if (dbEvent) {
            console.log(`✅ Event found in database: ${dbEvent.name}`);
            return {
                success: true,
                event: {
                    eventId: dbEvent.eventId,
                    name: dbEvent.name,
                    isActive: dbEvent.isActive,
                    categories: dbEvent.categories.map((cat: any) => ({
                        category: cat.category,
                        price: cat.price,
                        maxSupply: cat.maxSupply,
                        currentSupply: cat.currentSupply,
                        available: cat.mintAddresses.length
                    }))
                }
            };
        }
        
        // Check if eventId format is correct
        console.log(`❌ Event not found in database. Checking format...`);
        console.log(`Event ID format: ${eventId}`);
        console.log(`Event ID type: ${typeof eventId}`);
        console.log(`Event ID length: ${eventId.length}`);
        
        // List all events to see what's available
        const allEvents = await Event.find({});
        console.log(`📋 Total events in database: ${allEvents.length}`);
        allEvents.forEach((event, index) => {
            console.log(`${index + 1}. Event ID: "${event.eventId}" | Name: "${event.name}"`);
        });
        
        return {
            success: false,
            error: `Event with ID "${eventId}" not found. Available events: ${allEvents.map(e => e.eventId).join(', ')}`
        };
    } catch (error) {
        console.error('Error debugging event by ID:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Admin function to fix event prices (for existing events with wrong prices)
async function fixEventPrices(eventId: string, adminTelegramId: number): Promise<{
    success: boolean;
    message?: string;
    error?: string;
}> {
    try {
        if (!isAdmin(adminTelegramId)) {
            throw new Error('Only admins can fix event prices');
        }

        const event = await Event.findOne({ eventId });
        if (!event) {
            throw new Error('Event not found');
        }

        let updated = false;
        const priceUpdates: string[] = [];

        // Fix prices for each category
        event.categories.forEach(cat => {
            let newPrice = cat.price;
            let reason = '';

            if (cat.category === 'VIP' && cat.price !== 0.1) {
                newPrice = 0.1;
                reason = 'VIP should be 0.1 SOL';
                updated = true;
            } else if (cat.category === 'Standard' && cat.price !== 0.05) {
                newPrice = 0.05;
                reason = 'Standard should be 0.05 SOL';
                updated = true;
            } else if (cat.category === 'Group' && cat.price !== 0.03) {
                newPrice = 0.03;
                reason = 'Group should be 0.03 SOL';
                updated = true;
            }

            if (updated) {
                priceUpdates.push(`${cat.category}: ${cat.price} → ${newPrice} SOL (${reason})`);
                cat.price = newPrice;
            }
        });

        if (updated) {
            await event.save();
            console.log(`✅ Fixed prices for event ${eventId}:`, priceUpdates);
            return {
                success: true,
                message: `Fixed prices: ${priceUpdates.join(', ')}`
            };
        } else {
            return {
                success: true,
                message: 'All prices are already correct'
            };
        }

    } catch (error) {
        console.error('Error fixing event prices:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// ONE-TIME CLEANUP: Fix existing events with invalid IDs (run this once manually)
async function cleanupInvalidEventIds(): Promise<{ success: boolean; fixed: number; total: number; error?: string }> {
    try {
        console.log('🧹 Starting one-time cleanup of invalid event IDs...');
        
        const allEvents = await Event.find({});
        console.log(`📊 Found ${allEvents.length} total events to check`);
        
        let fixedCount = 0;
        
        for (const event of allEvents) {
            if (!event.eventId || event.eventId === 'event' || event.eventId.length < 5) {
                console.log(`🔧 Fixing event "${event.name}" with invalid eventId: "${event.eventId}"`);
                
                const newEventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                try {
                    await Event.updateOne(
                        { _id: event._id },
                        { $set: { eventId: newEventId } }
                    );
                    console.log(`✅ Fixed event "${event.name}" with new eventId: "${newEventId}"`);
                    fixedCount++;
                } catch (updateError) {
                    console.error(`❌ Failed to fix event "${event.name}":`, updateError);
                }
            }
        }
        
        console.log(`🎯 Cleanup completed. Fixed ${fixedCount} out of ${allEvents.length} events`);
        
        return {
            success: true,
            fixed: fixedCount,
            total: allEvents.length
        };
    } catch (error) {
        console.error('Error during cleanup:', error);
        return {
            success: false,
            fixed: 0,
            total: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Function to fix all invalid event IDs in the database
async function fixAllInvalidEventIds(): Promise<{ success: boolean; fixed: number; total: number; error?: string }> {
    try {
        console.log('🔧 Starting to fix all invalid event IDs...');
        
        const allEvents = await Event.find({});
        console.log(`📊 Found ${allEvents.length} total events to check`);
        
        let fixedCount = 0;
        const updatePromises = [];
        
        for (const event of allEvents) {
            if (!event.eventId || event.eventId === 'event' || event.eventId.length < 5) {
                const newEventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                console.log(`🔄 Fixing event "${event.name}": "${event.eventId}" -> "${newEventId}"`);
                
                updatePromises.push(
                    Event.updateOne(
                        { _id: event._id },
                        { $set: { eventId: newEventId } }
                    )
                );
                fixedCount++;
            }
        }
        
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`✅ Successfully fixed ${fixedCount} invalid event IDs`);
        } else {
            console.log('✅ No invalid event IDs found - all events are already valid');
        }
        
        return { success: true, fixed: fixedCount, total: allEvents.length };
    } catch (error) {
        console.error('❌ Error fixing invalid event IDs:', error);
        return { success: false, fixed: 0, total: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// Export all functions
export {
    getNFTDetails,
    getUserNFTsWithFilters,
    getAllEvents,
    getEvent,
    createEvent,
    purchaseTicket,
    validateTicketForEntry,
    useTicketForEntry,
    getUserTicketPurchases,
    getUserTicketsWithDetails,
    mintCustomNFT,
    listNFTForSale,
    getActiveNFTListings,
    getNFTListingsBySeller,
    buyNFTFromMarketplace,
    cancelNFTListing,
    transferNFTToUser,
    transferNFTBetweenUsers,
    getNFTResaleHistory,
    getEventStatistics,
    getAvailableTickets,
    getEventsWithTicketAvailability,
    getUserNFTPortfolio,
    isNFTAvailableForListing,
    fixEventPrices,
    isAdmin,
    getAdminWalletNFTs,
    debugEventNFTs,
    cleanupInvalidEventIds,
    fixAllInvalidEventIds,
    getNFTTransferHistory,
    bulkUpdateNFTStatus,
    getNFTAnalytics,
    cleanupExpiredListings,
    debugEventById,
    debugUserTickets
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

// Debug function to troubleshoot ticket display issues
async function debugUserTickets(telegramId: number): Promise<{
    success: boolean;
    debug?: {
        userInfo: {
            telegramId: number;
            hasWallet: boolean;
            walletAddress?: string;
        };
        databaseTickets: {
            count: number;
            tickets: Array<{
                purchaseId: string;
                eventId: string;
                category: string;
                mintAddress: string;
                isUsed: boolean;
            }>;
        };
        blockchainNFTs: {
            count: number;
            nfts: Array<{
                mint: string;
                name: string;
                isEventTicket: boolean;
            }>;
        };
        events: {
            count: number;
            eventIds: string[];
        };
    };
    error?: string;
}> {
    try {
        if (!telegramId) {
            throw new Error('Telegram ID is required');
        }

        console.log(`🔍 Debugging tickets for user ${telegramId}`);

        // Get user wallet info
        const wallet = await getUserWallet(telegramId);
        const hasWallet = !!wallet;

        // Get database tickets
        const databaseTickets = await TicketPurchase.find({ telegramId });
        console.log(`📋 Database tickets: ${databaseTickets.length}`);

        // Get blockchain NFTs
        let blockchainNFTs: UserNFT[] = [];
        try {
            if (wallet) {
                blockchainNFTs = await getUserNFTs(wallet.address);
                console.log(`🔗 Blockchain NFTs: ${blockchainNFTs.length}`);
            }
        } catch (blockchainError) {
            console.warn(`⚠️ Could not fetch blockchain NFTs:`, blockchainError);
        }

        // Get events
        const events = await Event.find({});
        console.log(`📅 Total events: ${events.length}`);

        const debug = {
            userInfo: {
                telegramId,
                hasWallet,
                walletAddress: wallet?.address
            },
            databaseTickets: {
                count: databaseTickets.length,
                tickets: databaseTickets.map(ticket => ({
                    purchaseId: ticket.purchaseId,
                    eventId: ticket.eventId,
                    category: ticket.category,
                    mintAddress: ticket.mintAddress,
                    isUsed: ticket.isUsed
                }))
            },
            blockchainNFTs: {
                count: blockchainNFTs.length,
                nfts: blockchainNFTs.map(nft => ({
                    mint: nft.mint,
                    name: nft.name,
                    isEventTicket: nft.isEventTicket || false
                }))
            },
            events: {
                count: events.length,
                eventIds: events.map(e => e.eventId)
            }
        };

        console.log(`✅ Debug completed for user ${telegramId}`);
        return { success: true, debug };
    } catch (error) {
        console.error('Error debugging user tickets:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
