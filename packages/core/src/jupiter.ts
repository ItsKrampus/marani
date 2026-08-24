import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  isSolanaError,
  partiallySignTransaction,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  type KeyPairSigner,
} from '@solana/kit';
import { feeParamsFor } from './fee-config.js';
import type { SolanaRpc } from './rpc.js';
import { sendWireTransaction, type SendResult } from './send.js';

/**
 * Jupiter swap integration (keyless). Both hosts serve /swap/v1 without a key
 * (verified live 2026-08-24); the lite host hiccups under load, so every call
 * walks the host list with per-request timeouts.
 */
const JUP_SWAP_HOSTS = ['https://lite-api.jup.ag/swap/v1', 'https://api.jup.ag/swap/v1'];

async function jupFetch(pathAndQuery: string, init: RequestInit | undefined, fetchImpl: typeof fetch): Promise<Response> {
  let lastError: Error = new Error('no Jupiter host reachable');
  for (let round = 0; round < 2; round++) {
    for (const host of JUP_SWAP_HOSTS) {
      try {
        const res = await fetchImpl(`${host}${pathAndQuery}`, { ...init, signal: AbortSignal.timeout(12_000) });
        if (res.ok) return res;
        const text = await res.text().catch(() => '');
        lastError = new Error(`Jupiter HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}`);
      } catch (e) {
        lastError = e as Error;
      }
    }
  }
  throw lastError;
}

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmountRaw: bigint;
  outAmountRaw: bigint;
  priceImpactPct: number;
  slippageBps: number;
  routeLabels: string[];
  /** Opaque quote payload passed back to /swap verbatim. */
  raw: unknown;
}

export async function getSwapQuote(params: {
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps?: number;
  fetchImpl?: typeof fetch;
}): Promise<JupQuote> {
  const { inputMint, outputMint, amountRaw, slippageBps = 50, fetchImpl = fetch } = params;
  const fee = feeParamsFor(outputMint);
  const res = await jupFetch(
    `/quote?inputMint=${encodeURIComponent(inputMint)}` +
      `&outputMint=${encodeURIComponent(outputMint)}&amount=${amountRaw}&slippageBps=${slippageBps}` +
      // liquid intermediate tokens only — exotic hops go stale and fail preflight
      `&restrictIntermediateTokens=true` +
      (fee ? `&platformFeeBps=${fee.platformFeeBps}` : ''),
    undefined,
    fetchImpl,
  );
  const body = (await res.json()) as {
    inputMint?: string;
    outputMint?: string;
    inAmount?: string;
    outAmount?: string;
    priceImpactPct?: string;
    slippageBps?: number;
    routePlan?: Array<{ swapInfo?: { label?: string } }>;
    error?: string;
  };
  if (!body.outAmount || !body.inAmount) {
    throw new Error(`Jupiter quote unavailable${body.error ? `: ${body.error}` : ''}`);
  }
  return {
    inputMint: String(body.inputMint ?? inputMint),
    outputMint: String(body.outputMint ?? outputMint),
    inAmountRaw: BigInt(body.inAmount),
    outAmountRaw: BigInt(body.outAmount),
    priceImpactPct: Number(body.priceImpactPct ?? '0'),
    slippageBps: body.slippageBps ?? slippageBps,
    routeLabels: (body.routePlan ?? [])
      .map((r) => String(r?.swapInfo?.label ?? ''))
      .filter(Boolean)
      .slice(0, 6),
    raw: body,
  };
}

export async function buildSwapTransaction(params: {
  quote: JupQuote;
  userPublicKey: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const { quote, userPublicKey, fetchImpl = fetch } = params;
  const res = await jupFetch(
    '/swap',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote.raw,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
        ...(feeParamsFor(quote.outputMint) ? { feeAccount: feeParamsFor(quote.outputMint)!.feeAccount } : {}),
      }),
    },
    fetchImpl,
  );
  const body = (await res.json()) as { swapTransaction?: string; error?: string };
  if (!body.swapTransaction) throw new Error(`Jupiter swap build failed${body.error ? `: ${body.error}` : ''}`);
  return body.swapTransaction;
}

/** Sign the Jupiter-serialized transaction with our keypair and broadcast it. */
export async function signAndSendSwap(
  rpc: SolanaRpc,
  signer: KeyPairSigner,
  swapTransactionBase64: string,
): Promise<SendResult> {
  const txBytes = getBase64Encoder().encode(swapTransactionBase64);
  const tx = getTransactionDecoder().decode(txBytes);
  const signedTx = await partiallySignTransaction([signer.keyPair], tx);
  const wire = getBase64EncodedWireTransaction(signedTx);
  return sendWireTransaction(rpc, wire);
}

/** True when the error means the transaction NEVER landed (rejected in simulation) — safe to retry. */
export function isPreflightFailure(e: unknown): boolean {
  if (isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /preflight|custom program error|#-32002/i.test(msg);
}

/**
 * Execute a swap end-to-end with stale-route protection: if the (initial)
 * quote's route fails preflight simulation, fetch a FRESH quote and try once
 * more. Only preflight failures are retried — anything broadcast is not.
 */
export async function executeSwapWithFreshRetry(
  rpc: SolanaRpc,
  signer: KeyPairSigner,
  params: {
    inputMint: string;
    outputMint: string;
    amountRaw: bigint;
    slippageBps?: number;
    initialQuote?: JupQuote;
    fetchImpl?: typeof fetch;
  },
): Promise<SendResult> {
  let quote =
    params.initialQuote ??
    (await getSwapQuote({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountRaw: params.amountRaw,
      slippageBps: params.slippageBps,
      fetchImpl: params.fetchImpl,
    }));
  for (let attempt = 0; ; attempt++) {
    try {
      const tx = await buildSwapTransaction({ quote, userPublicKey: signer.address, fetchImpl: params.fetchImpl });
      return await signAndSendSwap(rpc, signer, tx);
    } catch (e) {
      if (attempt === 0 && isPreflightFailure(e)) {
        quote = await getSwapQuote({
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amountRaw: params.amountRaw,
          slippageBps: params.slippageBps,
          fetchImpl: params.fetchImpl,
        });
        continue;
      }
      throw e;
    }
  }
}
