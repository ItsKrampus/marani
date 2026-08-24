import { address, type SolanaRpc } from '@marani/core';
import type { DestinationClass, ExchangeId, LabelSet } from './types.js';

/**
 * Sweep heuristic: CEX deposit addresses are periodically consolidated ("swept")
 * into labeled exchange hot wallets, usually with an exchange operational wallet
 * paying the fee. If the destination's recent history touches a labeled hot
 * wallet, we classify it as that exchange's deposit address.
 *
 * Failure mode (by design): fresh deposit addresses have zero history → null.
 */
export async function sweepClassify(params: {
  rpc: SolanaRpc;
  destination: string;
  labels: LabelSet;
  maxTransactions?: number;
}): Promise<Extract<DestinationClass, { kind: 'cex' }> | null> {
  const { rpc, destination, labels, maxTransactions = 6 } = params;
  const labelByAddress = new Map<string, ExchangeId>();
  for (const l of labels.entries) labelByAddress.set(l.address, l.exchange);
  if (labelByAddress.size === 0) return null;

  let signatures: Array<{ signature: string }>;
  try {
    const res = await rpc.getSignaturesForAddress(address(destination), { limit: 20 }).send();
    signatures = res.map((s) => ({ signature: String(s.signature) }));
  } catch {
    return null;
  }
  if (signatures.length === 0) return null;

  for (const { signature } of signatures.slice(0, maxTransactions)) {
    let tx: unknown;
    try {
      tx = await rpc
        .getTransaction(signature as Parameters<SolanaRpc['getTransaction']>[0], {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
        })
        .send();
    } catch {
      continue;
    }
    const accountKeys =
      (tx as { transaction?: { message?: { accountKeys?: Array<{ pubkey?: string; signer?: boolean }> } } })
        ?.transaction?.message?.accountKeys ?? [];
    for (const key of accountKeys) {
      const pubkey = typeof key?.pubkey === 'string' ? key.pubkey : '';
      if (!pubkey || pubkey === destination) continue;
      const exchange = labelByAddress.get(pubkey);
      if (exchange) {
        return {
          kind: 'cex',
          exchange,
          via: 'sweep',
          evidence: `history touches labeled ${exchange} wallet (${pubkey.slice(0, 4)}…) in tx ${signature.slice(0, 8)}…`,
        };
      }
    }
  }
  return null;
}
