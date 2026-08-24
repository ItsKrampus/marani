import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import { getTransferSolInstruction } from '@solana-program/system';
import * as splToken from '@solana-program/token';
import * as token2022 from '@solana-program/token-2022';
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  prependTransactionMessageInstruction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
  type Signature,
} from '@solana/kit';
import type { TokenProgramKind } from './balances.js';
import type { SolanaRpc } from './rpc.js';
import { sleep } from './util.js';

export interface TransferSpec {
  signer: KeyPairSigner;
  destination: string;
  amountRaw: bigint;
  /** null → native SOL transfer */
  token: { mint: string; decimals: number; program: TokenProgramKind } | null;
}

export interface SimulationResult {
  ok: boolean;
  err: unknown;
  logs: string[];
  unitsConsumed: bigint | null;
  feeLamports: bigint | null;
}

export interface SendResult {
  signature: string;
  confirmed: boolean;
  err: unknown;
}

const PRIORITY_FEE_MICROLAMPORTS = 100_000n; // 0.0001 lamport/CU — cheap but above floor
const COMPUTE_UNIT_LIMIT = 120_000; // generous for ATA create + transferChecked

async function buildInstructions(spec: TransferSpec): Promise<Instruction[]> {
  const destination = address(spec.destination);
  if (!spec.token) {
    return [
      getTransferSolInstruction({
        source: spec.signer,
        destination,
        amount: lamports(spec.amountRaw),
      }),
    ];
  }

  const mod = spec.token.program === 'token-2022' ? token2022 : splToken;
  const tokenProgram = spec.token.program === 'token-2022' ? token2022.TOKEN_2022_PROGRAM_ADDRESS : splToken.TOKEN_PROGRAM_ADDRESS;
  const mint = address(spec.token.mint);

  const [sourceAta] = await mod.findAssociatedTokenPda({
    owner: spec.signer.address,
    mint,
    tokenProgram,
  });
  const [destAta] = await mod.findAssociatedTokenPda({
    owner: destination,
    mint,
    tokenProgram,
  });

  return [
    mod.getCreateAssociatedTokenIdempotentInstruction({
      payer: spec.signer,
      owner: destination,
      mint,
      ata: destAta,
      tokenProgram,
    }),
    mod.getTransferCheckedInstruction({
      source: sourceAta,
      mint,
      destination: destAta,
      authority: spec.signer,
      amount: spec.amountRaw,
      decimals: spec.token.decimals,
    }),
  ];
}

async function buildMessage(rpc: SolanaRpc, spec: TransferSpec) {
  const instructions = await buildInstructions(spec);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(spec.signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) => prependTransactionMessageInstruction(getSetComputeUnitLimitInstruction({ units: COMPUTE_UNIT_LIMIT }), m),
    (m) =>
      prependTransactionMessageInstruction(
        getSetComputeUnitPriceInstruction({ microLamports: PRIORITY_FEE_MICROLAMPORTS }),
        m,
      ),
  );
}

/** Sign + simulate the transfer without broadcasting. */
export async function simulateTransfer(rpc: SolanaRpc, spec: TransferSpec): Promise<SimulationResult> {
  const message = await buildMessage(rpc, spec);
  const signed = await signTransactionMessageWithSigners(message);
  const wire = getBase64EncodedWireTransaction(signed);
  const { value } = await rpc
    .simulateTransaction(wire, { encoding: 'base64', replaceRecentBlockhash: true })
    .send();
  const logs = (value.logs ?? []).map(String);
  return {
    ok: value.err === null,
    err: value.err,
    logs,
    unitsConsumed: value.unitsConsumed != null ? BigInt(value.unitsConsumed) : null,
    feeLamports: null,
  };
}

async function pollConfirmation(rpc: SolanaRpc, signature: Signature, timeoutMs = 60_000): Promise<SendResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status) {
      if (status.err) return { signature, confirmed: false, err: status.err };
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return { signature, confirmed: true, err: null };
      }
    }
    await sleep(1500);
  }
  return { signature, confirmed: false, err: 'confirmation timed out' };
}

/** Sign and broadcast the transfer, then poll until confirmed (or timeout). */
export async function sendTransfer(rpc: SolanaRpc, spec: TransferSpec): Promise<SendResult> {
  const message = await buildMessage(rpc, spec);
  const signed = await signTransactionMessageWithSigners(message);
  const wire = getBase64EncodedWireTransaction(signed);
  const signature = await rpc.sendTransaction(wire, { encoding: 'base64', maxRetries: 3n }).send();
  return pollConfirmation(rpc, signature);
}

/** Broadcast an already-signed wire transaction (base64) and poll for confirmation. */
export async function sendWireTransaction(rpc: SolanaRpc, wireBase64: string): Promise<SendResult> {
  const signature = await rpc
    .sendTransaction(wireBase64 as Parameters<SolanaRpc['sendTransaction']>[0], {
      encoding: 'base64',
      maxRetries: 3n,
    })
    .send();
  return pollConfirmation(rpc, signature);
}

export { getSignatureFromTransaction };
