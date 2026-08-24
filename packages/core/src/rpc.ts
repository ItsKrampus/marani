import { createSolanaRpc, type Rpc, type SolanaRpcApi } from '@solana/kit';

/**
 * Keyless public endpoints, in preference order. api.mainnet-beta.solana.com
 * returns 403 to chrome-extension:// origins (verified 2026-08-24), so
 * PublicNode leads; the wallet probes and auto-picks at startup.
 */
export const RPC_CANDIDATES: readonly string[] = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
];

export const DEFAULT_RPC_URL = RPC_CANDIDATES[0]!;

export type SolanaRpc = Rpc<SolanaRpcApi>;

export function makeRpc(url: string = DEFAULT_RPC_URL): SolanaRpc {
  return createSolanaRpc(url);
}

/**
 * Probe candidates (a user-preferred URL first, if given) with a cheap getSlot
 * and return the first endpoint that answers. Falls back to the first candidate
 * so callers always get a URL.
 */
export async function pickRpcUrl(preferred?: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const candidates = preferred && preferred.trim() ? [preferred.trim(), ...RPC_CANDIDATES] : [...RPC_CANDIDATES];
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":1,"method":"getSlot"}',
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { result?: unknown };
      if (body?.result != null) return url;
    } catch {
      continue;
    }
  }
  return candidates[0]!;
}
