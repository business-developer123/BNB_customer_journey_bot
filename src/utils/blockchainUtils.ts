import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const bnbRpcProvider = process.env.BNB_RPC_PROVIDER || 'https://bsc-dataseed1.binance.org/';

// ERC-20 Token ABI for balance and metadata
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)'
];

// Common BSC tokens with proper checksum addresses and fallback metadata
const COMMON_TOKENS = [
  {
    address: '0xbb4CdB9CBd36B01bD1cBaEF2AF378a649ca0D3a8', // WBNB
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18
  },
  {
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
    symbol: 'BUSD',
    name: 'BUSD Token',
    decimals: 18
  },
  {
    address: '0x55d398326f99059fF775485246999027B3197955', // USDT
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 18
  },
  {
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 18
  },
  {
    address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
    symbol: 'CAKE',
    name: 'PancakeSwap Token',
    decimals: 18
  },
  {
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH
    symbol: 'ETH',
    name: 'Ethereum Token',
    decimals: 18
  },
  {
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
    symbol: 'BTCB',
    name: 'BTCB Token',
    decimals: 18
  }
];

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

// Get token balance for a specific token with improved error handling
export async function getTokenBalance(tokenAddress: string, walletAddress: string): Promise<{
  balance: string;
  symbol: string;
  name: string;
  decimals: number;
  address: string;
} | null> {
  try {
    // Get checksum address
    const checksumTokenAddress = getChecksumAddress(tokenAddress);
    const checksumWalletAddress = getChecksumAddress(walletAddress);
    
    const provider = new ethers.JsonRpcProvider(bnbRpcProvider);
    const tokenContract = new ethers.Contract(checksumTokenAddress, ERC20_ABI, provider);
    
    // Get token balance first with retry mechanism
    const balance = await retryWithBackoff(async () => {
      return await tokenContract.balanceOf(checksumWalletAddress);
    }, 2, 500);
    
    // Only proceed if balance is greater than 0
    if (balance <= BigInt(0)) {
      return null;
    }

    // Find token metadata from our predefined list
    const predefinedToken = COMMON_TOKENS.find(token => 
      getChecksumAddress(token.address) === checksumTokenAddress
    );

    let decimals = 18; // Default decimals
    let symbol = 'UNKNOWN';
    let name = 'Unknown Token';

    if (predefinedToken) {
      // Use predefined metadata
      decimals = predefinedToken.decimals;
      symbol = predefinedToken.symbol;
      name = predefinedToken.name;
    } else {
      // Try to get metadata from contract with fallback
      try {
        const [contractDecimals, contractSymbol, contractName] = await Promise.allSettled([
          retryWithBackoff(() => tokenContract.decimals(), 1, 300),
          retryWithBackoff(() => tokenContract.symbol(), 1, 300),
          retryWithBackoff(() => tokenContract.name(), 1, 300)
        ]);

        if (contractDecimals.status === 'fulfilled') {
          decimals = contractDecimals.value;
        }
        if (contractSymbol.status === 'fulfilled') {
          symbol = contractSymbol.value;
        }
        if (contractName.status === 'fulfilled') {
          name = contractName.value;
        }
      } catch (metadataError) {
        console.warn(`Could not fetch metadata for token ${checksumTokenAddress}:`, metadataError);
        // Use default values
      }
    }

    // Format balance
    const formattedBalance = ethers.formatUnits(balance, decimals);
    
    return {
      balance: formattedBalance,
      symbol,
      name,
      decimals,
      address: checksumTokenAddress
    };
  } catch (error) {
    console.error(`Error getting token balance for ${tokenAddress}:`, error);
    return null;
  }
}

// Get all token balances for a wallet with rate limiting and improved error handling
export async function getAllTokenBalances(walletAddress: string): Promise<{
  nativeBalance: string;
  tokens: Array<{
    balance: string;
    symbol: string;
    name: string;
    decimals: number;
    address: string;
  }>;
}> {
  try {
    // Validate wallet address
    if (!isValidWalletAddress(walletAddress)) {
      throw new Error('Invalid wallet address format');
    }

    const provider = new ethers.JsonRpcProvider(bnbRpcProvider);
    
    // Get native BNB balance
    const nativeBalance = await getWalletBalance(walletAddress);
    
    // Get token balances for common tokens with rate limiting
    const tokens: Array<{
      balance: string;
      symbol: string;
      name: string;
      decimals: number;
      address: string;
    }> = [];

    // Process tokens sequentially with delays to avoid rate limiting
    for (const token of COMMON_TOKENS) {
      try {
        // Add delay between requests to avoid rate limiting
        if (tokens.length > 0) {
          await delay(200); // 200ms delay between requests
        }

        const tokenBalance = await getTokenBalance(token.address, walletAddress);
        if (tokenBalance) {
          tokens.push(tokenBalance);
        }
      } catch (error) {
        console.error(`Error processing token ${token.symbol}:`, error);
        // Continue with next token instead of failing completely
        continue;
      }
    }

    return {
      nativeBalance,
      tokens
    };
  } catch (error) {
    console.error('Error getting all token balances:', error);
    throw new Error('Failed to get token balances');
  }
}

// Get token price from a simple price feed (you can integrate with CoinGecko or similar)
export async function getTokenPrice(symbol: string): Promise<number | null> {
  try {
    // This is a simplified price lookup - in production, you'd use a real price API
    const priceMap: { [key: string]: number } = {
      'WBNB': 300, // Example price
      'BUSD': 1,
      'USDT': 1,
      'USDC': 1,
      'CAKE': 2.5,
      'ETH': 2000,
      'BTCB': 45000
    };
    
    return priceMap[symbol] || null;
  } catch (error) {
    console.error(`Error getting price for ${symbol}:`, error);
    return null;
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