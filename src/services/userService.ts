import User, { IUser } from '../models/User';
import {
  getUserWallet,
  createWalletForUser,
  updateUserWallet,
  getUserWalletInfo as getWalletInfo,
  getUserWalletInfoWithTokens as getWalletInfoWithTokens,
  hasWallet as userHasWallet
} from './walletService';

// Check if user is already registered
export async function isUserRegistered(telegramId: number): Promise<boolean> {
  try {
    const user = await User.findOne({ telegramId });
    return user !== null;
  } catch (error) {
    console.error('Error checking if user is registered:', error);
    return false;
  }
}

// Find user by Telegram ID
export async function findByTelegramId(telegramId: number): Promise<IUser | null> {
  try {
    return await User.findOne({ telegramId });
  } catch (error) {
    console.error('Error finding user by Telegram ID:', error);
    return null;
  }
}

// Create new user
export async function createUser(userData: {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<IUser | null> {
  try {
    const user = new User(userData);
    return await user.save();
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

// Update user
export async function updateUser(telegramId: number, updateData: Partial<IUser>): Promise<IUser | null> {
  try {
    return await User.findOneAndUpdate(
      { telegramId },
      updateData,
      { new: true }
    );
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
}

// Get or create user (improved version)
export async function getOrCreateUser(userData: {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<IUser> {
  try {
    // First check if user already exists
    const existingUser = await findByTelegramId(userData.telegramId);

    if (existingUser) {
      // User already exists, return existing user without updating
      console.log(`User ${userData.telegramId} already registered, skipping creation`);
      return existingUser;
    }

    // User doesn't exist, create new user
    const newUser = await createUser(userData);
    if (!newUser) {
      throw new Error('Failed to create new user');
    }

    console.log(`New user ${userData.telegramId} registered successfully`);
    return newUser;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

// Get or create user with update option
export async function getOrCreateUserWithUpdate(userData: {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<IUser> {
  try {
    let user = await findByTelegramId(userData.telegramId);

    if (!user) {
      // User doesn't exist, create new user
      user = await createUser(userData);
      console.log(`New user ${userData.telegramId} registered successfully`);
    } else {
      // User exists, update their information
      user = await updateUser(userData.telegramId, {
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName
      });
      console.log(`User ${userData.telegramId} information updated`);
    }

    return user!;
  } catch (error) {
    console.error('Error in getOrCreateUserWithUpdate:', error);
    throw error;
  }
}

// Check if user has wallet (delegates to walletService)
export async function hasWallet(telegramId: number): Promise<boolean> {
  return await userHasWallet(telegramId);
}

// Get user wallet info with balance (delegates to walletService)
export async function getUserWalletInfo(telegramId: number): Promise<{
  address: string;
  isCustom: boolean;
  balance: string;
} | null> {
  return await getWalletInfo(telegramId);
}

// Get user wallet info with all token balances (delegates to walletService)
export async function getUserWalletInfoWithTokens(telegramId: number): Promise<{
  address: string;
  isCustom: boolean;
  tokens: Array<{
    balance: string;
    symbol: string;
    name: string;
    decimals: number;
    token_address: string;
  }>;
} | null> {
  return await getWalletInfoWithTokens(telegramId);
} 