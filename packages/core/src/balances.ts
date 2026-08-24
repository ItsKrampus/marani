import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import type { Address } from '@solana/kit';
import type { SolanaRpc } from './rpc.js';
import { withRetry } from './util.js';

export type TokenProgramKind = 'token' | 'token-2022';

export interface TokenBalance {
  mint: string;
  amountRaw: bigint;
  decimals: number;
  program: TokenProgramKind;
}

export interface Portfolio {
  lamports: bigint;
  tokens: TokenBalance[];
}

interface ParsedTokenAccount {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { amount?: string; decimals?: number };
        };
      };
    };
  };
}

function extractBalances(list: readonly unknown[], program: TokenProgramKind): TokenBalance[] {
  const out: TokenBalance[] = [];
  for (const item of list as ParsedTokenAccount[]) {
    const info = item?.account?.data?.parsed?.info;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.amount;
    const decimals = info?.tokenAmount?.decimals;
    if (typeof mint !== 'string' || typeof amount !== 'string' || typeof decimals !== 'number') continue;
    let raw: bigint;
    try {
      raw = BigInt(amount);
    } catch {
      continue;
    }
    if (raw <= 0n) continue;
    out.push({ mint, amountRaw: raw, decimals, program });
  }
  return out;
}

export async function getPortfolio(rpc: SolanaRpc, owner: Address): Promise<Portfolio> {
  // Sequential + retried: free public RPC tiers 429 on parallel bursts.
  const sol = await withRetry(() => rpc.getBalance(owner).send());
  const classic = await withRetry(() =>
    rpc.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ADDRESS }, { encoding: 'jsonParsed' }).send(),
  );
  const t22 = await withRetry(() =>
    rpc.getTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ADDRESS }, { encoding: 'jsonParsed' }).send(),
  );
  const tokens = [
    ...extractBalances(classic.value as readonly unknown[], 'token'),
    ...extractBalances(t22.value as readonly unknown[], 'token-2022'),
  ].sort((a, b) => (b.amountRaw > a.amountRaw ? 1 : -1));
  return { lamports: BigInt(sol.value), tokens };
}
