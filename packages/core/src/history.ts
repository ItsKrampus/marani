import { address } from '@solana/kit';
import type { SolanaRpc } from './rpc.js';
import { WSOL_MINT } from './tokens.js';
import { withRetry, withTimeout } from './util.js';

export interface ActivityItem {
  signature: string;
  slot: bigint;
  blockTime: number | null;
  err: unknown;
}

export async function getRecentActivity(rpc: SolanaRpc, owner: string, limit = 12): Promise<ActivityItem[]> {
  const sigs = await withRetry(() => rpc.getSignaturesForAddress(address(owner), { limit }).send());
  return sigs.map((s) => ({
    signature: String(s.signature),
    slot: BigInt(s.slot),
    blockTime: s.blockTime != null ? Number(s.blockTime) : null,
    err: s.err ?? null,
  }));
}

/** One balance change from the owner's perspective. `delta` is a signed base-unit integer string. */
export interface ActivityDelta {
  /** null = native SOL */
  mint: string | null;
  delta: string;
  decimals: number;
}

export interface ParsedActivity {
  signature: string;
  blockTime: number | null;
  failed: boolean;
  kind: 'sent' | 'received' | 'swap' | 'app';
  /** Negative deltas first, then positive. At most a handful. */
  deltas: ActivityDelta[];
}

interface ParsedTxShape {
  blockTime?: number | bigint | null;
  meta?: {
    err?: unknown;
    preBalances?: Array<number | bigint>;
    postBalances?: Array<number | bigint>;
    preTokenBalances?: Array<TokenBalanceShape>;
    postTokenBalances?: Array<TokenBalanceShape>;
  };
  transaction?: { message?: { accountKeys?: Array<{ pubkey?: string }> } };
}
interface TokenBalanceShape {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { amount?: string; decimals?: number };
}

function classify(tx: ParsedTxShape, owner: string, signature: string): ParsedActivity {
  const blockTime = tx.blockTime != null ? Number(tx.blockTime) : null;
  const failed = tx.meta?.err != null;

  // Token deltas for accounts owned by us, keyed by mint.
  const byMint = new Map<string, { delta: bigint; decimals: number }>();
  const apply = (list: TokenBalanceShape[] | undefined, sign: 1n | -1n) => {
    for (const b of list ?? []) {
      if (b?.owner !== owner || typeof b?.mint !== 'string') continue;
      const amount = b.uiTokenAmount?.amount;
      const decimals = b.uiTokenAmount?.decimals ?? 0;
      if (typeof amount !== 'string') continue;
      const cur = byMint.get(b.mint) ?? { delta: 0n, decimals };
      cur.delta += sign * BigInt(amount);
      cur.decimals = decimals;
      byMint.set(b.mint, cur);
    }
  };
  apply(tx.meta?.postTokenBalances, 1n);
  apply(tx.meta?.preTokenBalances, -1n);

  // Native SOL delta (merge any wSOL token delta into it — users see them as one thing).
  let solDelta = 0n;
  const keys = tx.transaction?.message?.accountKeys ?? [];
  const myIndex = keys.findIndex((k) => k?.pubkey === owner);
  if (myIndex >= 0) {
    const pre = tx.meta?.preBalances?.[myIndex];
    const post = tx.meta?.postBalances?.[myIndex];
    if (pre != null && post != null) solDelta = BigInt(String(post)) - BigInt(String(pre));
  }
  const wsol = byMint.get(WSOL_MINT);
  if (wsol) {
    solDelta += wsol.delta;
    byMint.delete(WSOL_MINT);
  }

  const deltas: ActivityDelta[] = [];
  // Ignore fee-sized SOL noise when tokens moved; always show SOL when it's the main event.
  const FEE_NOISE = 3_000_000n;
  const tokenDeltas = [...byMint.entries()].filter(([, v]) => v.delta !== 0n);
  const solSignificant = solDelta > FEE_NOISE || solDelta < -FEE_NOISE || (tokenDeltas.length === 0 && solDelta !== 0n);
  if (solSignificant) deltas.push({ mint: null, delta: solDelta.toString(), decimals: 9 });
  for (const [mint, v] of tokenDeltas) deltas.push({ mint, delta: v.delta.toString(), decimals: v.decimals });
  deltas.sort((a, b) => (BigInt(a.delta) < 0n && BigInt(b.delta) > 0n ? -1 : BigInt(a.delta) > 0n && BigInt(b.delta) < 0n ? 1 : 0));

  const hasNeg = deltas.some((d) => BigInt(d.delta) < 0n);
  const hasPos = deltas.some((d) => BigInt(d.delta) > 0n);
  const kind: ParsedActivity['kind'] = hasNeg && hasPos ? 'swap' : hasNeg ? 'sent' : hasPos ? 'received' : 'app';
  return { signature, blockTime, failed, kind, deltas: deltas.slice(0, 3) };
}

/**
 * Phantom-style history: recent signatures resolved into per-token balance
 * changes. `known` items (from an app-side cache — transactions are immutable)
 * are reused; only new signatures cost a getTransaction call each.
 */
export async function getParsedActivity(
  rpc: SolanaRpc,
  owner: string,
  opts: { limit?: number; known?: Record<string, ParsedActivity> } = {},
): Promise<{ items: ParsedActivity[]; parsedNew: ParsedActivity[] }> {
  const { limit = 12, known = {} } = opts;
  const sigs = await withRetry(() => rpc.getSignaturesForAddress(address(owner), { limit }).send());
  const items: ParsedActivity[] = [];
  const parsedNew: ParsedActivity[] = [];
  for (const s of sigs) {
    const signature = String(s.signature);
    const cached = known[signature];
    if (cached) {
      items.push(cached);
      continue;
    }
    try {
      const tx = (await withRetry(() =>
        withTimeout(
          rpc
            .getTransaction(signature as Parameters<SolanaRpc['getTransaction']>[0], {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0,
            })
            .send(),
          12_000,
          'getTransaction',
        ),
      )) as ParsedTxShape | null;
      const item = tx
        ? classify(tx, owner, signature)
        : {
            signature,
            blockTime: s.blockTime != null ? Number(s.blockTime) : null,
            failed: s.err != null,
            kind: 'app' as const,
            deltas: [],
          };
      items.push(item);
      parsedNew.push(item);
    } catch {
      // RPC hiccup — show a minimal row now, don't cache, retry next open
      items.push({
        signature,
        blockTime: s.blockTime != null ? Number(s.blockTime) : null,
        failed: s.err != null,
        kind: 'app',
        deltas: [],
      });
    }
  }
  return { items, parsedNew };
}
