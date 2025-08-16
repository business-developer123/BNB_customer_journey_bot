import { getUserNFTs, getNFTMetadata } from './nftUtils';

// Interface for user tickets with ownership information
export interface UserTicket {
    mintAddress: string;
    eventId: string;
    eventName: string;
    category: 'VIP' | 'Standard' | 'Group';
    price: number;
    purchasedAt: Date;
    isUsed: boolean;
    usedAt?: Date;
    // Ownership information
    isCurrentOwner: boolean;
    originalOwner: number;
    transferCount: number;
    lastTransferredAt?: Date;
    // NFT metadata
    name: string;
    description: string;
    image: string;
    symbol?: string;
    attributes: Array<{
        trait_type: string;
        value: string | number;
    }>;
}

/**
 * Get all tickets owned by a user (current ownership)
 * This function ensures users only see tickets they currently own
 */
export const getUserTickets = async (telegramId: number): Promise<{
    success: boolean;
    tickets?: UserTicket[];
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting tickets for user ${telegramId}`);
        
        // Import required models
        const { default: TicketPurchase } = await import('../models/TicketPurchase');
        const { default: User } = await import('../models/User');
        
        // Get user's wallet address
        const user = await User.findOne({ telegramId });
        if (!user?.wallet?.address) {
            return {
                success: false,
                error: 'User has no wallet address'
            };
        }
        
        // Get tickets where the user is the current owner and the ticket is active
        const ticketPurchases = await TicketPurchase.find({
            currentOwner: telegramId,
            isActive: true
        }).sort({ lastTransferredAt: -1, purchasedAt: -1 });
        
        if (ticketPurchases.length === 0) {
            return {
                success: true,
                tickets: []
            };
        }
        
        console.log(`📊 Found ${ticketPurchases.length} active tickets for user ${telegramId}`);
        
        // Get user's NFTs from blockchain to verify ownership
        const userNFTs = await getUserNFTs(user.wallet.address);
        const userNFTMints = new Set(userNFTs.map(nft => nft.mint));
        
        // Process each ticket purchase
        const userTickets: UserTicket[] = [];
        
        for (const ticketPurchase of ticketPurchases) {
            try {
                // Verify the user still owns this NFT on the blockchain
                if (!userNFTMints.has(ticketPurchase.mintAddress)) {
                    console.log(`⚠️ User ${telegramId} no longer owns NFT ${ticketPurchase.mintAddress} on blockchain, skipping`);
                    continue;
                }
                
                // Get NFT metadata from blockchain
                const nftMetadata = await getNFTMetadata(ticketPurchase.mintAddress);
                if (!nftMetadata) {
                    console.log(`⚠️ Could not fetch metadata for NFT ${ticketPurchase.mintAddress}, skipping`);
                    continue;
                }
                
                // Create user ticket object
                const userTicket: UserTicket = {
                    mintAddress: ticketPurchase.mintAddress,
                    eventId: ticketPurchase.eventId,
                    eventName: nftMetadata.eventDetails?.eventName || 'Unknown Event',
                    category: ticketPurchase.category,
                    price: ticketPurchase.price,
                    purchasedAt: ticketPurchase.purchasedAt,
                    isUsed: ticketPurchase.isUsed,
                    usedAt: ticketPurchase.usedAt,
                    isCurrentOwner: true,
                    originalOwner: ticketPurchase.originalOwner,
                    transferCount: ticketPurchase.transferCount,
                    lastTransferredAt: ticketPurchase.lastTransferredAt,
                    name: nftMetadata.name,
                    description: nftMetadata.description,
                    image: nftMetadata.image,
                    symbol: nftMetadata.symbol,
                    attributes: nftMetadata.attributes
                };
                
                userTickets.push(userTicket);
                
            } catch (ticketError) {
                console.warn(`⚠️ Error processing ticket ${ticketPurchase.mintAddress}:`, ticketError);
                // Continue with other tickets
            }
        }
        
        console.log(`✅ Successfully processed ${userTickets.length} tickets for user ${telegramId}`);
        
        return {
            success: true,
            tickets: userTickets
        };
        
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred while getting user tickets';
        console.error('❌ Failed to get user tickets:', errorMessage);
        return {
            success: false,
            error: errorMessage
        };
    }
};

/**
 * Get tickets for a specific event owned by a user
 */
export const getUserEventTickets = async (telegramId: number, eventId: string): Promise<{
    success: boolean;
    tickets?: UserTicket[];
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting tickets for user ${telegramId} for event ${eventId}`);
        
        const allTickets = await getUserTickets(telegramId);
        if (!allTickets.success) {
            return allTickets;
        }
        
        const eventTickets = allTickets.tickets?.filter(ticket => ticket.eventId === eventId) || [];
        
        return {
            success: true,
            tickets: eventTickets
        };
        
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred while getting user event tickets';
        console.error('❌ Failed to get user event tickets:', errorMessage);
        return {
            success: false,
            error: errorMessage
        };
    }
};

/**
 * Get transfer history for a specific ticket
 */
export const getTicketTransferHistory = async (mintAddress: string): Promise<{
    success: boolean;
    transfers?: Array<{
        fromTelegramId: number;
        toTelegramId: number;
        fromWalletAddress: string;
        toWalletAddress: string;
        transferredAt: Date;
        transactionSignature: string;
        transferType: string;
        transferReason?: string;
    }>;
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting transfer history for ticket ${mintAddress}`);
        
        // Import required models
        const { default: TransferHistory } = await import('../models/TransferHistory');
        
        const transfers = await TransferHistory.find({ 
            mintAddress 
        }).sort({ transferredAt: -1 });
        
        if (transfers.length === 0) {
            return {
                success: true,
                transfers: []
            };
        }
        
        const transferHistory = transfers.map(transfer => ({
            fromTelegramId: transfer.fromTelegramId,
            toTelegramId: transfer.toTelegramId,
            fromWalletAddress: transfer.fromWalletAddress,
            toWalletAddress: transfer.toWalletAddress,
            transferredAt: transfer.transferredAt,
            transactionSignature: transfer.transactionSignature,
            transferType: transfer.transferType,
            transferReason: transfer.transferReason
        }));
        
        console.log(`✅ Found ${transferHistory.length} transfers for ticket ${mintAddress}`);
        
        return {
            success: true,
            transfers: transferHistory
        };
        
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred while getting transfer history';
        console.error('❌ Failed to get transfer history:', errorMessage);
        return {
            success: false,
            error: errorMessage
        };
    }
};

/**
 * Get all tickets that a user has ever owned (including transferred ones)
 */
export const getUserTicketHistory = async (telegramId: number): Promise<{
    success: boolean;
    tickets?: Array<{
        mintAddress: string;
        eventId: string;
        eventName: string;
        category: 'VIP' | 'Standard' | 'Group';
        price: number;
        purchasedAt: Date;
        isUsed: boolean;
        usedAt?: Date;
        isCurrentOwner: boolean;
        originalOwner: number;
        transferCount: number;
        lastTransferredAt?: Date;
        ownershipStatus: 'current' | 'transferred' | 'original';
    }>;
    error?: string;
}> => {
    try {
        console.log(`🔍 Getting complete ticket history for user ${telegramId}`);
        
        // Import required models
        const { default: TicketPurchase } = await import('../models/TicketPurchase');
        
        // Get all tickets where user was ever involved (as original owner, current owner, or in transfer history)
        const allTickets = await TicketPurchase.find({
            $or: [
                { originalOwner: telegramId },
                { currentOwner: telegramId },
                { 'transferHistory.fromTelegramId': telegramId },
                { 'transferHistory.toTelegramId': telegramId }
            ]
        }).sort({ lastTransferredAt: -1, purchasedAt: -1 });
        
        if (allTickets.length === 0) {
            return {
                success: true,
                tickets: []
            };
        }
        
        const ticketHistory = allTickets.map(ticket => {
            let ownershipStatus: 'current' | 'transferred' | 'original' = 'original';
            
            if (ticket.currentOwner === telegramId) {
                ownershipStatus = 'current';
            } else if (ticket.originalOwner === telegramId) {
                ownershipStatus = 'transferred';
            } else {
                // Check if user was in transfer history
                const inTransferHistory = ticket.transferHistory.some(
                    transfer => transfer.fromTelegramId === telegramId || transfer.toTelegramId === telegramId
                );
                if (inTransferHistory) {
                    ownershipStatus = 'transferred';
                }
            }
            
            return {
                mintAddress: ticket.mintAddress,
                eventId: ticket.eventId,
                eventName: 'Unknown Event', // Would need to fetch from Event model
                category: ticket.category,
                price: ticket.price,
                purchasedAt: ticket.purchasedAt,
                isUsed: ticket.isUsed,
                usedAt: ticket.usedAt,
                isCurrentOwner: ticket.currentOwner === telegramId,
                originalOwner: ticket.originalOwner,
                transferCount: ticket.transferCount,
                lastTransferredAt: ticket.lastTransferredAt,
                ownershipStatus
            };
        });
        
        console.log(`✅ Found ${ticketHistory.length} tickets in history for user ${telegramId}`);
        
        return {
            success: true,
            tickets: ticketHistory
        };
        
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred while getting ticket history';
        console.error('❌ Failed to get ticket history:', errorMessage);
        return {
            success: false,
            error: errorMessage
        };
    }
};
