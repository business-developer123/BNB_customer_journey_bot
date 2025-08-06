import { ethers } from 'ethers';
import dotenv from 'dotenv';
import Moralis from 'moralis';
import { getUserWalletPrivateKey } from '../services/walletService';

dotenv.config();

const bnbRpcProvider = process.env.BNB_RPC_PROVIDER;
const moralisApiKey = process.env.MORALIS_API_KEY;

// ERC20 ABI for token transfers
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
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

    // Determine if we're using testnet or mainnet based on RPC URL
    const isTestnet = bnbRpcProvider?.includes('testnet') || bnbRpcProvider?.includes('bsc-testnet') || bnbRpcProvider?.includes('data-seed-prebsc');
    const chainId = isTestnet ? "0x61" : "0x38"; // 0x61 = BSC Testnet, 0x38 = BSC Mainnet

    console.log(`🔗 Using ${isTestnet ? 'BSC Testnet' : 'BSC Mainnet'} for token fetching (Chain ID: ${chainId})`);

    await Moralis.start({
      apiKey: moralisApiKey
    });

    const response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
      "chain": chainId,
      "address": walletAddress
    });

    const tokens = (response.result || []).map((token: any) => ({
      token_address: token.tokenAddress._value,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance: token.balanceFormatted
    }));

    console.log(`📊 Found ${tokens.length} tokens for wallet ${walletAddress} on ${isTestnet ? 'testnet' : 'mainnet'}`);
    return tokens;
  } catch (error) {
    console.error('❌ Error getting all token balances:', error);
    throw new Error('Failed to get token balances');
  }
}

export async function transferToken(
  senderAddress: string,
  tokenAddress: string,
  amount: string,
  recipientAddress: string,
) {
  try {
    // Validate inputs
    if (!isValidWalletAddress(recipientAddress)) {
      throw new Error('Invalid recipient address format');
    }

    if (!isValidWalletAddress(tokenAddress)) {
      throw new Error('Invalid token address format');
    }

    const privateKey = await getUserWalletPrivateKey(senderAddress);

    if (!privateKey) {
      throw new Error('Private key not found in environment variables');
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid amount provided');
    }

    // Choose RPC provider based on network
    const rpcProvider = bnbRpcProvider;
    const provider = new ethers.JsonRpcProvider(rpcProvider);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create contract instance
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    // Get token decimals
    const decimals = await retryWithBackoff(async () => {
      return await contract.decimals();
    });

    // Convert amount to wei (smallest unit)
    const amountInWei = ethers.parseUnits(amount, decimals);

    // Check sender balance
    const senderBalance = await retryWithBackoff(async () => {
      return await contract.balanceOf(wallet.address);
    });

    if (senderBalance < amountInWei) {
      throw new Error('Insufficient token balance');
    }

    // Estimate gas for the transaction
    const gasEstimate = await retryWithBackoff(async () => {
      return await contract.transfer.estimateGas(recipientAddress, amountInWei);
    });

    // Add 20% buffer to gas estimate
    const gasLimit = gasEstimate * BigInt(120) / BigInt(100);

    // Get current gas price
    const gasPrice = await retryWithBackoff(async () => {
      return await provider.getFeeData();
    });

    // Execute the transfer
    const tx = await retryWithBackoff(async () => {
      return await contract.transfer(recipientAddress, amountInWei, {
        gasLimit: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
      });
    });

    // Wait for transaction confirmation
    const receipt = await retryWithBackoff(async () => {
      return await tx.wait();
    });

    // Determine network for transaction result
    const isTestnet = bnbRpcProvider?.includes('testnet') || bnbRpcProvider?.includes('bsc-testnet') || bnbRpcProvider?.includes('data-seed-prebsc');
    const network = isTestnet ? 'BSC Testnet' : 'BSC Mainnet';

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
      network: network
    };

  } catch (error) {
    console.error('❌ Error transferring token:', error);
    throw new Error(`Failed to transfer token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Transfer BNB (native token)
export async function transferBNB(
  senderAddress: string,
  recipientAddress: string,
  amount: string,
) {
  try {
    // Validate inputs
    if (!isValidWalletAddress(recipientAddress)) {
      throw new Error('Invalid recipient address format');
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid amount provided');
    }

    // Choose RPC provider based on network
    const rpcProvider = bnbRpcProvider;
    const provider = new ethers.JsonRpcProvider(rpcProvider);
    const privateKey = await getUserWalletPrivateKey(senderAddress);
    if (!privateKey) {
      throw new Error('Private key not found in environment variables');
    }
    const wallet = new ethers.Wallet(privateKey, provider);

    // Convert amount to wei
    const amountInWei = ethers.parseEther(amount);

    // Check sender balance
    const senderBalance = await retryWithBackoff(async () => {
      return await provider.getBalance(wallet.address);
    });

    if (senderBalance < amountInWei) {
      throw new Error('Insufficient BNB balance');
    }

    // Get current gas price
    const gasPrice = await retryWithBackoff(async () => {
      return await provider.getFeeData();
    });

    // Estimate gas for the transaction
    const gasEstimate = await retryWithBackoff(async () => {
      return await provider.estimateGas({
        to: recipientAddress,
        value: amountInWei
      });
    });

    // Add 20% buffer to gas estimate
    const gasLimit = gasEstimate * BigInt(120) / BigInt(100);

    // Calculate total cost (amount + gas fees)
    const gasCost = gasLimit * (gasPrice.maxFeePerGas || gasPrice.gasPrice || BigInt(0));
    const totalCost = amountInWei + gasCost;

    if (senderBalance < totalCost) {
      throw new Error('Insufficient BNB balance to cover transfer amount and gas fees');
    }
    // Execute the transfer
    const tx = await retryWithBackoff(async () => {
      return await wallet.sendTransaction({
        to: recipientAddress,
        value: amountInWei,
        gasLimit: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
      });
    });

    // Wait for transaction confirmation
    const receipt = await retryWithBackoff(async () => {
      return await tx.wait();
    });

    // Determine network for transaction result
    const isTestnet = bnbRpcProvider?.includes('testnet') || bnbRpcProvider?.includes('bsc-testnet') || bnbRpcProvider?.includes('data-seed-prebsc');
    const network = isTestnet ? 'BSC Testnet' : 'BSC Mainnet';

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
      network: network
    };

  } catch (error) {
    console.error('❌ Error transferring BNB:', error);
    throw new Error(`Failed to transfer BNB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get transaction status
export async function getTransactionStatus(
  transactionHash: string,
) {
  try {
    const rpcProvider = bnbRpcProvider;
    const provider = new ethers.JsonRpcProvider(rpcProvider);

    const receipt = await retryWithBackoff(async () => {
      return await provider.getTransactionReceipt(transactionHash);
    });

    if (!receipt) {
      return {
        status: 'pending',
        message: 'Transaction is still pending'
      };
    }

    // Determine network for transaction result
    const isTestnet = bnbRpcProvider?.includes('testnet') || bnbRpcProvider?.includes('bsc-testnet') || bnbRpcProvider?.includes('data-seed-prebsc');
    const network = isTestnet ? 'BSC Testnet' : 'BSC Mainnet';

    return {
      status: receipt.status === 1 ? 'success' : 'failed',
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      network: network
    };

  } catch (error) {
    console.error('❌ Error getting transaction status:', error);
    throw new Error(`Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  const isTestnet = bnbRpcProvider?.includes('testnet') || bnbRpcProvider?.includes('bsc-testnet') || bnbRpcProvider?.includes('data-seed-prebsc');
  console.log(`🔗 Creating provider for ${isTestnet ? 'BSC Testnet' : 'BSC Mainnet'}`);
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