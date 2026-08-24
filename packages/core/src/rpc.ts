import { createSolanaRpc, type Rpc, type SolanaRpcApi } from '@solana/kit';

export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

export type SolanaRpc = Rpc<SolanaRpcApi>;

export function makeRpc(url: string = DEFAULT_RPC_URL): SolanaRpc {
  return createSolanaRpc(url);
}
