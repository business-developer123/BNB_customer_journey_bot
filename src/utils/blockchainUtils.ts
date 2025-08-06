import { ethers } from 'ethers';
import dotenv from 'dotenv';
import Moralis from 'moralis';

dotenv.config();

const bnbRpcProvider = process.env.BNB_RPC_PROVIDER || 'https://bsc-dataseed1.binance.org/';
const moralisApiKey = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImY1M2U2MWYyLTBlNWEtNDY3Yi04ODRkLTJmZDlmOGQ1YWEyNyIsIm9yZ0lkIjoiNDM2NDgxIiwidXNlcklkIjoiNDQ5MDM0IiwidHlwZUlkIjoiNWE5YzE0OGItMTgzMi00MDcyLWJhOWEtMDMyZmNiYWEwMDIxIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NDIwNDA5NTgsImV4cCI6NDg5NzgwMDk1OH0.fibGojwTsgRP6f8QKEwytS6VgY9BmXXfxaJy0nBQ-QE';

// Helper function to add delay between requests
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry operations with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Check if it's a rate limit error
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        if (errorCode === -32007 || errorCode === 'CALL_EXCEPTION') {
          // Rate limit or call exception, wait longer
          const delayTime = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
          console.log(`Rate limit hit, retrying in ${delayTime}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await delay(delayTime);
          continue;
        }
      }

      // For other errors, use shorter delay
      const delayTime = baseDelay * Math.pow(1.5, attempt);
      console.log(`Operation failed, retrying in ${delayTime}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await delay(delayTime);
    }
  }

  throw lastError!;
}

// Helper function to get checksum address
function getChecksumAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch (error) {
    console.error(`Invalid address format: ${address}`);
    return address;
  }
}

// Generate a new BNB wallet
export function generateWallet() {
  try {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase
    };
  } catch (error) {
    console.error('Error generating wallet:', error);
    throw new Error('Failed to generate wallet');
  }
}

// Create wallet from private key
export function createWalletFromPrivateKey(privateKey: string) {
  try {
    // Remove '0x' prefix if present
    const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    // Validate private key format
    if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
      throw new Error('Invalid private key format');
    }

    const wallet = new ethers.Wallet(`0x${cleanPrivateKey}`);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  } catch (error) {
    console.error('Error creating wallet from private key:', error);
    throw new Error('Invalid private key');
  }
}

// Get wallet balance (BNB)
export async function getWalletBalance(address: string): Promise<string> {
  try {
    // Validate address parameter
    if (!address || typeof address !== 'string' || address.trim() === '') {
      throw new Error('Invalid wallet address provided');
    }

    // Validate address format
    if (!isValidWalletAddress(address)) {
      throw new Error('Invalid wallet address format');
    }

    // Connect to BSC network with retry mechanism
    const provider = new ethers.JsonRpcProvider(bnbRpcProvider);
    const balance = await retryWithBackoff(async () => {
      return await provider.getBalance(address);
    }, 2, 500);

    return ethers.formatEther(balance);
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    throw new Error('Failed to get wallet balance');
  }
}

export async function getAllTokensInfoOfUserWallet(walletAddress: string): Promise<Array<{
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}>> {
  try {
    if (!isValidWalletAddress(walletAddress)) {
      throw new Error('Invalid wallet address format');
    }

    await Moralis.start({
      apiKey: moralisApiKey
    });

    const response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
      "chain": "0x38",
      "address": walletAddress
    });

    const tokens = (response.result || []).map((token: any) => ({
      token_address: token.tokenAddress._value,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance: token.balanceFormatted
    }));

    return tokens;
  } catch (error) {
    console.error('❌ Error getting all token balances:', error);
    throw new Error('Failed to get token balances');
  }
}

// Format token balance with proper decimals
export function formatTokenBalance(balance: string, decimals: number): string {
  try {
    const numBalance = parseFloat(balance);
    if (numBalance === 0) return '0';

    // Format based on balance size
    if (numBalance < 0.0001) {
      return numBalance.toExponential(4);
    } else if (numBalance < 1) {
      return numBalance.toFixed(6);
    } else if (numBalance < 1000) {
      return numBalance.toFixed(4);
    } else {
      return numBalance.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
  } catch (error) {
    return balance;
  }
}

// Validate wallet address
export function isValidWalletAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch (error) {
    return false;
  }
}

// Get BSC provider
export function getBSCProvider() {
  return new ethers.JsonRpcProvider(bnbRpcProvider);
}

// Format BNB amount
export function formatBNB(amount: bigint): string {
  return ethers.formatEther(amount);
}

// Parse BNB amount
export function parseBNB(amount: string): bigint {
  return ethers.parseEther(amount);
} 