import type { KeyPairSigner } from '@solana/kit';
import { buildSwapTransaction, getSwapQuote, signAndSendSwap, type JupQuote } from './jupiter.js';
import type { SolanaRpc } from './rpc.js';
import type { SendResult } from './send.js';
import { WSOL_MINT } from './tokens.js';
import { withRetry } from './util.js';

/**
 * The Cellar — staking & yield.
 *
 * SOL staking is implemented as instant liquid staking: swapping SOL into an
 * LST (jitoSOL / mSOL) via Jupiter. Holding the LST *is* the stake — it
 * accrues staking yield in its price; unstaking swaps back instantly (no
 * multi-day deactivation). This is the standard in-wallet staking pattern.
 *
 * USDC yield goes through Jupiter Lend's Earn API (largest USDC pool on
 * Solana): the API returns unsigned transactions we sign locally — identical
 * trust model to our Jupiter swap flow.
 */

export const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
export const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
/** Jupiter Lend's USDC receipt token — holding it is the Earn position. */
export const JLUSDC_MINT = '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D';

export interface LstOption {
  symbol: string;
  name: string;
  provider: string;
  mint: string;
}

export const LST_OPTIONS: readonly LstOption[] = [
  { symbol: 'jitoSOL', name: 'Jito staked SOL', provider: 'Jito', mint: JITOSOL_MINT },
  { symbol: 'mSOL', name: 'Marinade staked SOL', provider: 'Marinade', mint: MSOL_MINT },
];

export function quoteStake(params: { solLamports: bigint; lstMint: string; fetchImpl?: typeof fetch }) {
  return getSwapQuote({
    inputMint: WSOL_MINT,
    outputMint: params.lstMint,
    amountRaw: params.solLamports,
    slippageBps: 50,
    fetchImpl: params.fetchImpl,
  });
}

export function quoteUnstake(params: { lstMint: string; amountRaw: bigint; fetchImpl?: typeof fetch }) {
  return getSwapQuote({
    inputMint: params.lstMint,
    outputMint: WSOL_MINT,
    amountRaw: params.amountRaw,
    slippageBps: 50,
    fetchImpl: params.fetchImpl,
  });
}

/** Execute a stake/unstake quote (it's a Jupiter swap under the hood). */
export async function executeLstSwap(rpc: SolanaRpc, signer: KeyPairSigner, quote: JupQuote): Promise<SendResult> {
  const tx = await buildSwapTransaction({ quote, userPublicKey: signer.address });
  return signAndSendSwap(rpc, signer, tx);
}

const LEND_BASE = 'https://api.jup.ag/lend/v1';

async function buildEarnTransaction(
  path: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return withRetry(async () => {
    const res = await fetchImpl(`${LEND_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jupiter Lend HTTP ${res.status}: ${text.slice(0, 160)}`);
    }
    const json = (await res.json()) as { transaction?: string };
    if (typeof json.transaction !== 'string' || json.transaction.length < 100) {
      throw new Error('Jupiter Lend returned no transaction');
    }
    return json.transaction;
  });
}

/** Deposit `amountRaw` base units of `assetMint` into Jupiter Lend Earn. */
export async function lendDeposit(
  rpc: SolanaRpc,
  signer: KeyPairSigner,
  params: { assetMint: string; amountRaw: bigint; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  const tx = await buildEarnTransaction(
    '/earn/deposit',
    { asset: params.assetMint, amount: params.amountRaw.toString(), signer: signer.address },
    params.fetchImpl,
  );
  return signAndSendSwap(rpc, signer, tx);
}

/** Withdraw by burning `sharesRaw` receipt-token units (e.g. the full jlUSDC balance). */
export async function lendRedeem(
  rpc: SolanaRpc,
  signer: KeyPairSigner,
  params: { assetMint: string; sharesRaw: bigint; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  const tx = await buildEarnTransaction(
    '/earn/redeem',
    { asset: params.assetMint, shares: params.sharesRaw.toString(), signer: signer.address },
    params.fetchImpl,
  );
  return signAndSendSwap(rpc, signer, tx);
}
