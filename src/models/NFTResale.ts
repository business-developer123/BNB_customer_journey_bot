import mongoose, { Schema, Document } from 'mongoose';

export interface INFTResale extends Document {
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

const NFTResaleSchema = new Schema<INFTResale>({
    resaleId: { type: String, required: true, unique: true },
    originalListingId: { type: String, required: true },
    sellerTelegramId: { type: Number, required: true },
    buyerTelegramId: { type: Number, required: true },
    mintAddress: { type: String, required: true },
    price: { type: Number, required: true },
    resaleNumber: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    royaltyPaid: { type: Number, required: true }
});

export default mongoose.model<INFTResale>('NFTResale', NFTResaleSchema);
