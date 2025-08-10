import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
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

const EventSchema = new Schema<IEvent>({
    eventId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    venue: { type: String, required: true },
    imageUrl: { type: String, required: true },
    categories: [{
        category: { type: String, enum: ['VIP', 'Standard', 'Group'], required: true },
        price: { type: Number, required: true },
        maxSupply: { type: Number, required: true },
        currentSupply: { type: Number, default: 0 },
        mintAddresses: [{ type: String }]
    }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IEvent>('Event', EventSchema);
