import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  type KeyPairSigner,
} from '@solana/kit';
import type { SolanaRpc } from './rpc.js';
import { sendWireTransaction, type SendResult } from './send.js';

/**
 * Jupiter swap integration (keyless lite tier).
 * Verified live 2026-08-24: /swap/v1/quote routes USDG→USDC at ~0% impact.
 */
const JUP_BASE = 'https://lite-api.jup.ag/swap/v1';

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
  const url =
    `${JUP_BASE}/quote?inputMint=${encodeURIComponent(inputMint)}` +
    `&outputMint=${encodeURIComponent(outputMint)}&amount=${amountRaw}&slippageBps=${slippageBps}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Jupiter quote failed: HTTP ${res.status}`);
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
  const res = await fetchImpl(`${JUP_BASE}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jupiter swap build failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
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
