import { Connection, VersionedTransaction, clusterApiUrl, Keypair } from '@solana/web3.js';
import fetch from "node-fetch";

type QuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
};

export type NetworkName = 'mainnet' | 'devnet';

const JUP_BASE = 'https://quote-api.jup.ag/v6';
function getClusterSuffix(network: NetworkName): string {
  return network === 'devnet' ? 'cluster=devnet' : '';
}

export function getNetworkFromEnv(): NetworkName {
  const rpc = process.env.SOLANA_RPC_PROVIDER || '';
  return rpc.includes('devnet') ? 'devnet' : 'mainnet';
}

export const COMMON_MINTS = {
  mainnet: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  devnet: {
    SOL: 'So11111111111111111111111111111111111111112',
    // Devnet stable mints (subject to change; common ones below)
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    USDT: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'
  }
} as const;

const SYMBOL_ALIASES: Record<string, 'SOL' | 'USDC' | 'USDT'> = {
  SOL: 'SOL',
  WSOL: 'SOL',
  USDC: 'USDC',
  USDT: 'USDT'
};

export function resolveMintSymbol(input: string): 'SOL' | 'USDC' | 'USDT' | null {
  const key = (input || '').toUpperCase().trim();
  return (SYMBOL_ALIASES as any)[key] || null;
}

export async function fetchPrice(inputMint: string, outputMint: string, amountInAtomic: string, slippageBps = 100): Promise<QuoteResponse> {
  const network = getNetworkFromEnv();
  const cluster = getClusterSuffix(network);
  const url = `${JUP_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInAtomic}&slippageBps=${slippageBps}${cluster ? `&${cluster}` : ''}`;
  
  const res = await fetch(url);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Jupiter quote API error:', res.status, res.statusText, errorText);
    throw new Error(`Jupiter quote API error: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json() as QuoteResponse;
  return data;
}

export async function createSwapTransaction(quote: QuoteResponse, userPublicKey: string): Promise<string> {
  try {
    const network = getNetworkFromEnv();
    const cluster = getClusterSuffix(network);
    const url = `${JUP_BASE}/swap${cluster ? `?${cluster}` : ''}`; // v6 swap endpoint
    
    const body = {
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: 'auto'  // Use 'auto' instead of object for v6
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Jupiter swap API error:', res.status, res.statusText, errorText);
      throw new Error(`Jupiter API error: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await res.json() as { swapTransaction?: string };
    
    if (!data.swapTransaction) {
      throw new Error('No swap transaction returned from Jupiter API');
    }
    
    return data.swapTransaction;
  } catch (error) {
    console.error("createSwapTx error:", error);
    throw error;
  }
}

export async function signAndSendSwapTransaction(base64Tx: string, privateKeyHex: string): Promise<string> {
  try {
    if (!base64Tx) {
      throw new Error("No transaction data provided");
    }
    
    if (typeof base64Tx !== 'string') {
      throw new Error(`Expected string transaction data, received: ${typeof base64Tx}`);
    }
    
    const secretKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const kp = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(process.env.SOLANA_RPC_PROVIDER || clusterApiUrl('mainnet-beta'));

    // Deserialize the transaction from base64
    const transactionBuffer = Buffer.from(base64Tx, "base64");
    const tx = VersionedTransaction.deserialize(transactionBuffer);
    
    // Sign the transaction
    tx.sign([kp]);
    
    // Send the transaction
    const sig = await connection.sendRawTransaction(tx.serialize(), { 
      skipPreflight: false, 
      maxRetries: 3 
    });
    
    // Confirm the transaction
    await connection.confirmTransaction(sig, 'confirmed');
    
    return sig;
  } catch (error) {
    console.error("signAndSendSwapTransaction error:", error);
    
    // Enhanced error handling for common swap failures
    if (error instanceof Error) {
      const errorMessage = error.message;
      
      // Check for insufficient lamports error
      if (errorMessage.includes('insufficient lamports') || 
          errorMessage.includes('Transfer: insufficient lamports')) {
        const match = errorMessage.match(/insufficient lamports (\d+), need (\d+)/);
        if (match) {
          const current = parseInt(match[1]);
          const needed = parseInt(match[2]);
          const currentSOL = (current / 1e9).toFixed(4);
          const neededSOL = (needed / 1e9).toFixed(4);
          throw new Error(`Insufficient SOL: You have ${currentSOL} SOL but need ${neededSOL} SOL for this transaction`);
        } else {
          throw new Error('Insufficient SOL balance for this transaction');
        }
      }
      
      // Check for simulation failed errors
      if (errorMessage.includes('Transaction simulation failed')) {
        throw new Error('Transaction simulation failed - please check your balance and try again');
      }
      
      // Check for slippage tolerance exceeded
      if (errorMessage.includes('SlippageToleranceExceeded')) {
        throw new Error('Price moved too much during swap - try increasing slippage tolerance');
      }
    }
    
    throw error;
  }
}



