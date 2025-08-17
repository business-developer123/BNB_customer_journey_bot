import mongoose, { Schema, Document } from 'mongoose';

export interface ITransferHistory extends Document {
    transferId: string;
    mintAddress: string;
    fromTelegramId: number;
    toTelegramId: number | null; // Can be null for external wallet transfers
    fromWalletAddress: string;
    toWalletAddress: string;
    transactionSignature: string;
    transferType: 'user_to_user' | 'system_to_user' | 'user_to_system' | 'user_to_external';
    transferReason?: string;
    transferredAt: Date;
    blockNumber?: number;
    gasUsed?: number;
    status: 'pending' | 'confirmed' | 'failed';
    metadata?: {
        eventId?: string;
        eventName?: string;
        category?: string;
        price?: number;
    };
}

const TransferHistorySchema = new Schema<ITransferHistory>({
    transferId: { 
        type: String, 
        required: true, 
        unique: true,
        default: () => `TRANSFER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },
    mintAddress: { 
        type: String, 
        required: true, 
        index: true 
    },
    fromTelegramId: { 
        type: Number, 
        required: true, 
        index: true 
    },
    toTelegramId: { 
        type: Number, 
        required: false, // Allow null for external wallet transfers
        index: true 
    },
    fromWalletAddress: { 
        type: String, 
        required: true 
    },
    toWalletAddress: { 
        type: String, 
        required: true 
    },
    transactionSignature: { 
        type: String, 
        required: true, 
        unique: true 
    },
    transferType: { 
        type: String, 
        enum: ['user_to_user', 'system_to_user', 'user_to_system', 'user_to_external'], 
        required: true,
        default: 'user_to_user'
    },
    transferReason: { 
        type: String 
    },
    transferredAt: { 
        type: Date, 
        default: Date.now,
        index: true
    },
    blockNumber: { 
        type: Number 
    },
    gasUsed: { 
        type: Number 
    },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'failed'], 
        required: true,
        default: 'pending'
    },
    metadata: {
        eventId: String,
        eventName: String,
        category: String,
        price: Number
    }
});

// Create compound indexes for efficient querying
TransferHistorySchema.index({ mintAddress: 1, transferredAt: -1 });
TransferHistorySchema.index({ fromTelegramId: 1, transferredAt: -1 });
TransferHistorySchema.index({ toTelegramId: 1, transferredAt: -1 });
TransferHistorySchema.index({ status: 1, transferredAt: -1 });

export default mongoose.model<ITransferHistory>('TransferHistory', TransferHistorySchema);
