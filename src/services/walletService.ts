import User, { IUser } from '../models/User';
import { generateWallet, createWalletFromPrivateKey, getWalletBalance, getAllTokensInfoOfUserWallet } from '../utils/blockchainUtils';

// Get user's wallet from database
export async function getUserWallet(telegramId: number): Promise<{ address: string; isCustom: boolean } | null> {
  try {
    const user = await User.findOne({ telegramId });
    if (!user || !user.wallet || !user.wallet.address) {
      return null;
    }
    
    // Validate wallet address
    if (!user.wallet.address || user.wallet.address.trim() === '') {
      console.log('Invalid wallet address found for user:', telegramId);
      return null;
    }
    
    return {
      address: user.wallet.address,
      isCustom: user.wallet.isCustom
    };
  } catch (error) {
    console.error('Error getting user wallet:', error);
    return null;
  }
}

// Create wallet for user (database operation)
export async function createWalletForUser(telegramId: number): Promise<{ address: string; privateKey: string }> {
  try {
    const user = await User.findOne({ telegramId });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user already has a wallet
    if (user.wallet && user.wallet.address) {
      throw new Error('User already has a wallet');
    }

    // Generate new wallet using blockchain utility
    const newWallet = generateWallet();
    
    // Update user with wallet information in database
    const updatedUser = await User.findOneAndUpdate(
      { telegramId },
      {
        wallet: {
          address: newWallet.address,
          privateKey: newWallet.privateKey,
          isCustom: false,
          createdAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('Failed to update user with wallet');
    }

    return {
      address: newWallet.address,
      privateKey: newWallet.privateKey
    };
  } catch (error) {
    console.error('Error creating wallet for user:', error);
    throw error;
  }
}

// Update user's wallet with custom private key (database operation)
export async function updateUserWallet(telegramId: number, privateKey: string): Promise<{ address: string }> {
  try {
    const user = await User.findOne({ telegramId });
    if (!user) {
      throw new Error('User not found');
    }

    // Create wallet from private key using blockchain utility
    const wallet = createWalletFromPrivateKey(privateKey);
    
    // Update user with new wallet information in database (delete old wallet)
    const updatedUser = await User.findOneAndUpdate(
      { telegramId },
      {
        wallet: {
          address: wallet.address,
          privateKey: wallet.privateKey,
          isCustom: true,
          createdAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('Failed to update user wallet');
    }

    return {
      address: wallet.address
    };
  } catch (error) {
    console.error('Error updating user wallet:', error);
    throw error;
  }
}

// Get user wallet info with balance (combines database and blockchain operations)
export async function getUserWalletInfo(telegramId: number): Promise<{
  address: string;
  isCustom: boolean;
  balance: string;
} | null> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet || !wallet.address) {
      return null;
    }

    // Validate wallet address before calling blockchain
    if (!wallet.address || wallet.address.trim() === '') {
      console.log('Invalid wallet address for user:', telegramId);
      return null;
    }

    // Get balance using blockchain utility
    const balance = await getWalletBalance(wallet.address);
    return {
      address: wallet.address,
      isCustom: wallet.isCustom,
      balance
    };
  } catch (error) {
    console.error('Error getting user wallet info:', error);
    return null;
  }
}

// Get user wallet info with all token balances (combines database and blockchain operations)
export async function getUserWalletInfoWithTokens(telegramId: number): Promise<{
  address: string;
  isCustom: boolean;
  tokens: Array<{
    balance: string;
    symbol: string;
    name: string;
    token_address: string;
  }>;
} | null> {
  try {
    const wallet = await getUserWallet(telegramId);
    if (!wallet || !wallet.address) {
      return null;
    }

    // Validate wallet address before calling blockchain
    if (!wallet.address || wallet.address.trim() === '') {
      console.log('Invalid wallet address for user:', telegramId);
      return null;
    }

    // Get all token balances using blockchain utility
    const allTokensInfo = await getAllTokensInfoOfUserWallet(wallet.address);
    return {
      address: wallet.address,
      isCustom: wallet.isCustom,
      tokens: allTokensInfo
    };
  } catch (error) {
    console.error('Error getting user wallet info with tokens:', error);
    return null;
  }
}

// Check if user has wallet (database operation)
export async function hasWallet(telegramId: number): Promise<boolean> {
  try {
    const wallet = await getUserWallet(telegramId);
    return wallet !== null;
  } catch (error) {
    console.error('Error checking if user has wallet:', error);
    return false;
  }
}

// Delete user's wallet (database operation)
export async function deleteUserWallet(telegramId: number): Promise<boolean> {
  try {
    const updatedUser = await User.findOneAndUpdate(
      { telegramId },
      { $unset: { wallet: 1 } },
      { new: true }
    );

    return updatedUser !== null;
  } catch (error) {
    console.error('Error deleting user wallet:', error);
    return false;
  }
}

// Get all wallets (database operation)
export async function getAllWallets(): Promise<Array<{ telegramId: number; address: string; isCustom: boolean }>> {
  try {
    const users = await User.find({ 'wallet.address': { $exists: true } });
    return users.map(user => ({
      telegramId: user.telegramId,
      address: user.wallet!.address,
      isCustom: user.wallet!.isCustom
    }));
  } catch (error) {
    console.error('Error getting all wallets:', error);
    return [];
  }
} 

// Get private key for a given wallet address
export async function getUserWalletPrivateKey(senderAddress: string): Promise<string | null> {
  try {
    // Find the user by wallet address
    const user = await User.findOne({ 'wallet.address': senderAddress });
    if (!user || !user.wallet || !user.wallet.privateKey) {
      return null;
    }
    return user.wallet.privateKey;
  } catch (error) {
    console.error('Error getting user wallet private key:', error);
    return null;
  }
} 