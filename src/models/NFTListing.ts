import mongoose, { Schema, Document } from 'mongoose';

export interface INFTListing extends Document {
    listingId: string;
    sellerTelegramId: number;
    mintAddress: string;
    price: number;
    listingType: 'fixed' | 'auction';
    startTime: Date;
    endTime?: Date;
    isActive: boolean;
    originalPrice?: number;
    maxResalePrice?: number;
    resaleCount: number;
    maxResales: number;
}

const NFTListingSchema = new Schema<INFTListing>({
    listingId: { type: String, required: true, unique: true },
    sellerTelegramId: { type: Number, required: true },
    mintAddress: { type: String, required: true },
    price: { type: Number, required: true },
    listingType: { type: String, enum: ['fixed', 'auction'], default: 'fixed' },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    isActive: { type: Boolean, default: true },
    originalPrice: { type: Number },
    maxResalePrice: { type: Number },
    resaleCount: { type: Number, default: 0 },
    maxResales: { type: Number, default: 10 }
});

export default mongoose.model<INFTListing>('NFTListing', NFTListingSchema);
