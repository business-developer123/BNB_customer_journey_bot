import { Connection, VersionedTransaction, clusterApiUrl, Keypair } from '@solana/web3.js';

type QuoteResponse = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
};

export type NetworkName = 'mainnet' | 'devnet';

async function doFetch(url: string, init?: RequestInit): Promise<Response> {
  const gf: any = (globalThis as any).fetch;
  if (gf) return gf(url, init);
  const mod: any = await import('node-fetch');
  const f = mod.default || mod;
  return f(url, init);
}

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

export async function fetchPrice(inputMint: string, outputMint: string, amountInAtomic: string, slippageBps = 100): Promise<QuoteResponse> {
  const network = getNetworkFromEnv();
  const cluster = getClusterSuffix(network);
  const url = `${JUP_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInAtomic}&slippageBps=${slippageBps}${cluster ? `&${cluster}` : ''}`;
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch quote: ${res.status}`);
  const data = await res.json();
  // Jupiter returns { data: Quote[] }
  const best = data?.data?.[0];
  if (!best) throw new Error('No route found');
  return best as QuoteResponse;
}

export async function createSwapTransaction(quote: QuoteResponse, userPublicKey: string) {
  const network = getNetworkFromEnv();
  const cluster = getClusterSuffix(network);
  const url = `${JUP_BASE}/swap${cluster ? `?${cluster}` : ''}`; // v6 swap endpoint
  const body = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    asLegacyTransaction: false
  };
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create swap tx: ${res.status} ${txt}`);
  }
  const data = await res.json();
  // data.swapTransaction is base64
  return data.swapTransaction as string;
}

export async function signAndSendSwapTransaction(base64Tx: string, privateKeyHex: string): Promise<string> {
  const secretKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
  const kp = Keypair.fromSecretKey(secretKey);
  const connection = new Connection(process.env.SOLANA_RPC_PROVIDER || clusterApiUrl('mainnet-beta'));

  const tx = VersionedTransaction.deserialize(Buffer.from(base64Tx, 'base64'));
  tx.sign([kp]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}



