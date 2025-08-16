import mongoose, { Schema, Document } from 'mongoose';

export interface ITicketPurchase extends Document {
    purchaseId: string;
    telegramId: number;
    eventId: string;
    category: 'VIP' | 'Standard' | 'Group';
    mintAddress: string;
    price: number;
    purchasedAt: Date;
    isUsed: boolean;
    usedAt?: Date;
    // Enhanced fields for transfer tracking
    currentOwner: number; // Current owner's Telegram ID
    originalOwner: number; // Original purchaser's Telegram ID
    transferCount: number; // Number of times this ticket has been transferred
    lastTransferredAt?: Date; // When it was last transferred
    isActive: boolean; // Whether this ticket is currently active/owned
    transferHistory: Array<{
        fromTelegramId: number;
        toTelegramId: number;
        transferredAt: Date;
        transactionSignature: string;
    }>;
}

const TicketPurchaseSchema = new Schema<ITicketPurchase>({
    purchaseId: { type: String, required: true, unique: true },
    telegramId: { type: Number, required: true }, // This now represents the original purchaser
    eventId: { type: String, required: true },
    category: { type: String, enum: ['VIP', 'Standard', 'Group'], required: true },
    mintAddress: { type: String, required: true, unique: true }, // Each NFT can only have one active record
    price: { type: Number, required: true },
    purchasedAt: { type: Date, default: Date.now },
    isUsed: { type: Boolean, default: false },
    usedAt: { type: Date },
    // Enhanced fields
    currentOwner: { type: Number, required: true, index: true }, // Index for efficient querying
    originalOwner: { type: Number, required: true },
    transferCount: { type: Number, default: 0 },
    lastTransferredAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true },
    transferHistory: [{
        fromTelegramId: { type: Number, required: true },
        toTelegramId: { type: Number, required: true },
        transferredAt: { type: Date, required: true },
        transactionSignature: { type: String, required: true }
    }]
});

// Create indexes for efficient querying
TicketPurchaseSchema.index({ currentOwner: 1, isActive: 1 }); // For getting user's current tickets
TicketPurchaseSchema.index({ mintAddress: 1, isActive: 1 }); // For checking ticket status
TicketPurchaseSchema.index({ eventId: 1, currentOwner: 1 }); // For getting user's tickets for specific event

export default mongoose.model<ITicketPurchase>('TicketPurchase', TicketPurchaseSchema);
