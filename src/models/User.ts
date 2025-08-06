import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  wallet?: {
    address: string;
    privateKey?: string;
    isCustom: boolean;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: false
  },
  firstName: {
    type: String,
    required: false
  },
  lastName: {
    type: String,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  wallet: {
    address: {
      type: String,
      required: false
    },
    privateKey: {
      type: String,
      required: false
    },
    isCustom: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema); 