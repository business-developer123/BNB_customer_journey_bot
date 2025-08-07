import dotenv from 'dotenv';
import Moralis from 'moralis';
import * as solanaWeb3 from '@solana/web3.js';
import { LAMPORTS_PER_SOL, Keypair, PublicKey } from '@solana/web3.js';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { sendAndConfirmTransaction, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { getUserWalletPrivateKey } from '../services/walletService';

dotenv.config();

const moralisApiKey = process.env.MORALIS_API_KEY;

// --- Wallet Generation ---
export function generateWallet() {
  try {
    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex'),
      mnemonic: undefined
    };
  } catch (error) {
    console.error('Error generating wallet:', error);
    throw new Error('Failed to generate wallet');
  }
}
// --- Create Wallet from Private Key ---
export function createWalletFromPrivateKey(privateKey: string) {
  try {
    if (!privateKey || typeof privateKey !== 'string' || privateKey.trim() === '') {
      throw new Error('Invalid private key provided');
    }

    // Try to decode as base58 first (most common format for Solana private keys)
    let secretKey: Uint8Array;

    try {
      secretKey = new Uint8Array(bs58.decode(privateKey));
    } catch (base58Error) {
      // If base58 fails, try hex format
      try {
        secretKey = Uint8Array.from(Buffer.from(privateKey, 'hex'));
      } catch (hexError) {
        throw new Error('Private key must be in base58 or hex format');
      }
    }

    // Validate secret key length
    if (secretKey.length !== 64) {
      throw new Error(`Secret key must be 64 bytes, got ${secretKey.length} bytes`);
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex')
    };
  } catch (error) {
    console.error('Error creating wallet from private key:', error);
    throw new Error('Invalid private key');
  }
}
// --- Get Wallet Balance (SOL) ---
export async function getWalletBalance(address: string): Promise<string> {
  try {
    if (!address || typeof address !== 'string' || address.trim() === '') {
      throw new Error('Invalid wallet address provided');
    }
    if (!isValidWalletAddress(address)) {
      throw new Error('Invalid wallet address format');
    }
    const connection = new Connection(process.env.SOLANA_RPC_PROVIDER || clusterApiUrl('mainnet-beta'));
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return (balance / LAMPORTS_PER_SOL).toString();
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    throw new Error('Failed to get wallet balance');
  }
}

export async function getAllTokensInfoOfUserWallet(walletAddress: string): Promise<Array<{
  token_address: string;
  symbol: string;
  name: string;
  balance: string;
}>> {
  try {
    if (!isValidWalletAddress(walletAddress)) {
      throw new Error('Invalid wallet address format');
    }

    const isTestnet = process.env.SOLANA_RPC_PROVIDER?.includes('testnet') || process.env.SOLANA_RPC_PROVIDER?.includes('data-seed-prebsc');

    await Moralis.start({
      apiKey: moralisApiKey
    });

    const responseNative = await Moralis.SolApi.account.getBalance({
      "network": isTestnet ? "testnet" : "mainnet",
      "address": walletAddress
    });



    let tokens: any[] = [];
    tokens.push({
      token_address: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      balance: (Number(responseNative.result.solana) / LAMPORTS_PER_SOL).toString(),
      decimals: 9,
    });

    const responseSPL = await Moralis.SolApi.account.getSPL({
      "network": isTestnet ? "testnet" : "mainnet",
      "address": walletAddress,
    });

    // responseSPL is directly an array
    const splTokens = responseSPL.toJSON()
    splTokens.forEach((token: any) => {
      tokens.push({
        token_address: token.mint,
        symbol: token.symbol,
        name: token.name,
        balance: token.amount,
        decimals: token.decimals,
        price: token.amountRaw
      });
    });

    console.log(`📊 Found ${tokens.length} tokens for wallet ${walletAddress} on ${isTestnet ? 'testnet' : 'mainnet'}`);
    return tokens;
  } catch (error) {
    console.error('❌ Error getting all token balances:', error);
    throw new Error('Failed to get token balances');
  }
}

// --- Transfer SOL (native token) ---
export async function transferSOL(
  senderAddress: string,
  recipientAddress: string,
  amount: string,
) {
  try {
    if (!isValidWalletAddress(recipientAddress)) {
      throw new Error('Invalid recipient address format');
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid amount provided');
    }
    const privateKey = await getUserWalletPrivateKey(senderAddress);
    if (!privateKey) {
      throw new Error('Private key not found in environment variables');
    }
    const secretKey = Uint8Array.from(Buffer.from(privateKey, 'hex'));
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(process.env.SOLANA_RPC_PROVIDER || clusterApiUrl('mainnet-beta'));
    const recipientPubkey = new PublicKey(recipientAddress);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: Math.round(numAmount * LAMPORTS_PER_SOL)
      })
    );
    const signature = await sendAndConfirmTransaction(connection, transaction, [senderKeypair]);
    const solscanLink = getSolscanLink(signature);
    return {
      success: true,
      transactionHash: signature,
      solscanLink: solscanLink
    };
  } catch (error) {
    console.error('❌ Error transferring SOL:', error);
    throw new Error(`Failed to transfer SOL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Validate Wallet Address ---
export function isValidWalletAddress(address: string): boolean {
  try {
    return PublicKey.isOnCurve(address);
  } catch (error) {
    return false;
  }
}

// --- Format SOL amount ---
export function formatSOL(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 9 });
}
// --- Parse SOL amount ---
export function parseSOL(amount: string): number {
  return parseFloat(amount);
}

// --- Generate Solscan Link ---
export function getSolscanLink(transactionHash: string): string {
  try {
    if (!transactionHash || typeof transactionHash !== 'string' || transactionHash.trim() === '') {
      throw new Error('Invalid transaction hash provided');
    }

    const isTestnet = process.env.SOLANA_RPC_PROVIDER?.includes('testnet') || process.env.SOLANA_RPC_PROVIDER?.includes('data-seed-prebsc');

    const baseUrl = 'https://solscan.io';

    // For Solscan mainnet
    if (!isTestnet) {
      return `https://solscan.io/tx/${transactionHash}`;
    }

    // For Solana Explorer testnet/devnet
    return `${baseUrl}/tx/${transactionHash}?cluster=${isTestnet ? 'testnet' : 'mainnet'}`;
  } catch (error) {
    console.error('Error generating Solscan link:', error);
    throw new Error('Failed to generate Solscan link');
  }
}

// --- Get Network Info for Solana ---
export function getSolanaNetworkInfo() {
  const solanaRpcProvider = process.env.SOLANA_RPC_PROVIDER;
  const isTestnet = solanaRpcProvider?.includes('testnet') ||
    solanaRpcProvider?.includes('devnet') ||
    solanaRpcProvider?.includes('data-seed-prebsc');
  const networkInfo = isTestnet ? '🟡 Solana Testnet' : '🟢 Solana Mainnet';
  const explorerName = isTestnet ? 'Solana Explorer' : 'Solscan';
  return { isTestnet, networkInfo, explorerName };
} 