import { createSolanaRpc, type Rpc, type SolanaRpcApi } from '@solana/kit';

/**
 * Keyless public endpoints, in preference order. Verified 2026-08-24:
 * - api.mainnet-beta.solana.com 403s chrome-extension:// origins outright
 * - solana-rpc.publicnode.com allows the origin but blocks getTokenAccountsByOwner
 * - solana.leorpc.com (FREE tier) serves the heavy methods with extension origins
 * The startup probe tests getTokenAccountsByOwner — the strictest method the
 * wallet needs — so only fully-usable endpoints get picked.
 */
export const RPC_CANDIDATES: readonly string[] = [
  'https://solana.leorpc.com/?api_key=FREE',
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
];

export const DEFAULT_RPC_URL = RPC_CANDIDATES[0]!;

export type Cluster = 'mainnet' | 'devnet';

/** api.devnet.solana.com allows extension origins + heavy methods (verified 2026-08-24). */
export const DEVNET_RPC_CANDIDATES: readonly string[] = ['https://api.devnet.solana.com'];

export function rpcCandidatesFor(cluster: Cluster): readonly string[] {
  return cluster === 'devnet' ? DEVNET_RPC_CANDIDATES : RPC_CANDIDATES;
}

/** Explorer link that follows the active cluster. */
export function explorerUrl(kind: 'tx' | 'account' | 'token', id: string, cluster: Cluster = 'mainnet'): string {
  return `https://solscan.io/${kind}/${id}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
}

export type SolanaRpc = Rpc<SolanaRpcApi>;

export function makeRpc(url: string = DEFAULT_RPC_URL): SolanaRpc {
  return createSolanaRpc(url);
}

/** Cheap but strict probe: the heaviest method the wallet depends on, with a mint filter. */
const PROBE_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'getTokenAccountsByOwner',
  params: [
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    { encoding: 'jsonParsed' },
  ],
});

/**
 * Probe candidates (a user-preferred URL first, if given) and return the first
 * endpoint that can serve the wallet's heaviest RPC method. Falls back to the
 * first candidate so callers always get a URL.
 */
export async function pickRpcUrl(
  preferred?: string,
  cluster: Cluster = 'mainnet',
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const base = rpcCandidatesFor(cluster);
  const candidates = preferred && preferred.trim() ? [preferred.trim(), ...base] : [...base];
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: PROBE_BODY,
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { result?: unknown; error?: unknown };
      if (body?.result != null && body?.error == null) return url;
    } catch {
      continue;
    }
  }
  return candidates[0]!;
}
