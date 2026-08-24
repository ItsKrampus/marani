import { address } from '@solana/kit';
import type { SolanaRpc } from './rpc.js';

export interface ActivityItem {
  signature: string;
  slot: bigint;
  blockTime: number | null;
  err: unknown;
}

export async function getRecentActivity(rpc: SolanaRpc, owner: string, limit = 12): Promise<ActivityItem[]> {
  const sigs = await rpc.getSignaturesForAddress(address(owner), { limit }).send();
  return sigs.map((s) => ({
    signature: String(s.signature),
    slot: BigInt(s.slot),
    blockTime: s.blockTime != null ? Number(s.blockTime) : null,
    err: s.err ?? null,
  }));
}
