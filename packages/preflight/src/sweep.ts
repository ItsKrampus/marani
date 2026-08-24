import { address, type SolanaRpc } from '@marani/core';
import type { DestinationClass, ExchangeId, LabelSet } from './types.js';

/**
 * Sweep heuristic: CEX deposit addresses are periodically consolidated ("swept")
 * into labeled exchange hot wallets, usually with an exchange operational wallet
 * paying the fee. We only classify on true sweep patterns:
 *   1. an outbound transfer FROM the destination INTO a labeled hot wallet, or
 *   2. a transaction on the destination whose fee payer is a labeled exchange wallet.
 * Merely appearing in the same transaction as an exchange wallet is NOT enough —
 * a regular user who traded with an exchange would false-positive otherwise.
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

  interface ParsedIx {
    program?: string;
    parsed?: { type?: string; info?: Record<string, unknown> };
  }
  interface ParsedTx {
    transaction?: {
      message?: {
        accountKeys?: Array<{ pubkey?: string; signer?: boolean }>;
        instructions?: ParsedIx[];
      };
    };
  }

  for (const { signature } of signatures.slice(0, maxTransactions)) {
    let tx: ParsedTx | null;
    try {
      tx = (await rpc
        .getTransaction(signature as Parameters<SolanaRpc['getTransaction']>[0], {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
        })
        .send()) as ParsedTx | null;
    } catch {
      continue;
    }
    const message = tx?.transaction?.message;
    if (!message) continue;

    // Signal 2: exchange operational wallet pays the fee for the destination's tx.
    const feePayer = message.accountKeys?.[0]?.pubkey;
    if (typeof feePayer === 'string' && feePayer !== destination) {
      const exchange = labelByAddress.get(feePayer);
      if (exchange) {
        return {
          kind: 'cex',
          exchange,
          via: 'sweep',
          evidence: `${exchange} operational wallet paid fees in tx ${signature.slice(0, 8)}…`,
        };
      }
    }

    // Signal 1: outbound transfer from the destination into a labeled hot wallet.
    for (const ix of message.instructions ?? []) {
      const info = ix?.parsed?.info;
      const type = ix?.parsed?.type ?? '';
      if (!info || !/^transfer(Checked)?$/.test(type)) continue;
      const source = typeof info['source'] === 'string' ? (info['source'] as string) : '';
      const authority = typeof info['authority'] === 'string' ? (info['authority'] as string) : '';
      const dest = typeof info['destination'] === 'string' ? (info['destination'] as string) : '';
      const wallet = typeof info['wallet'] === 'string' ? (info['wallet'] as string) : '';
      const outbound = source === destination || authority === destination;
      if (!outbound) continue;
      const target = labelByAddress.get(dest) ?? labelByAddress.get(wallet);
      if (target) {
        return {
          kind: 'cex',
          exchange: target,
          via: 'sweep',
          evidence: `funds swept to labeled ${target} wallet in tx ${signature.slice(0, 8)}…`,
        };
      }
    }
  }
  return null;
}
