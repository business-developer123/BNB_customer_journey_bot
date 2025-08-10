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
}

const TicketPurchaseSchema = new Schema<ITicketPurchase>({
    purchaseId: { type: String, required: true, unique: true },
    telegramId: { type: Number, required: true },
    eventId: { type: String, required: true },
    category: { type: String, enum: ['VIP', 'Standard', 'Group'], required: true },
    mintAddress: { type: String, required: true },
    price: { type: Number, required: true },
    purchasedAt: { type: Date, default: Date.now },
    isUsed: { type: Boolean, default: false },
    usedAt: { type: Date }
});

export default mongoose.model<ITicketPurchase>('TicketPurchase', TicketPurchaseSchema);
