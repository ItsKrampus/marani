import { assertIsAddress, type Address } from '@solana/kit';

/** Returns true when `value` parses as a valid base58 Solana address. */
export function isSolanaAddress(value: string): value is Address {
  try {
    assertIsAddress(value);
    return true;
  } catch {
    return false;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Format a raw integer token amount for display, e.g. (1234500n, 6) -> "1.2345". */
export function formatRawAmount(raw: bigint, decimals: number, maxFraction = decimals): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, '0');
  frac = frac.slice(0, maxFraction).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

/** Display-only amount: compact for big balances (1.23M, 48B), precise for small ones. Never for inputs. */
export function formatAmountCompact(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const num = Number(abs) / 10 ** decimals;
  const s = num >= 10_000 ? compactFmt.format(num) : formatRawAmount(abs, decimals, num >= 1 ? 4 : 5);
  return (negative ? '−' : '') + s;
}

/** Parse a user-entered decimal string into a raw integer amount. Throws on invalid input. */
export function parseAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d*)?$/.test(trimmed)) throw new Error('Invalid amount');
  const [wholeStr = '0', fracStr = ''] = trimmed.split('.');
  if (fracStr.length > decimals) throw new Error(`Max ${decimals} decimal places`);
  const whole = BigInt(wholeStr);
  const frac = BigInt(fracStr.padEnd(decimals, '0') || '0');
  return whole * 10n ** BigInt(decimals) + frac;
}

export function shortAddress(addr: string, chars = 4): string {
  return addr.length <= chars * 2 + 1 ? addr : `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON.stringify that survives the BigInts Kit puts in RPC responses. */
export function safeJson(value: unknown, max = 200): string {
  try {
    const s = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    return (s ?? String(value)).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

/** Translate raw chain/API errors into a human explanation with a suggested fix. Null when unknown. */
export function explainTxError(raw: string): string | null {
  const r = raw.toLowerCase();
  if (/not tradable|token_not_tradable|could_not_find_any_route|no route/.test(r)) {
    return "This token has no live market on Jupiter, so it can't be swapped. If the exchange doesn't accept it either, there is no safe way to deposit it anywhere — keep it in your wallet, or sell it on the platform where it trades.";
  }
  if (/insufficientfundsforrent|insufficient funds for rent/.test(r)) {
    return 'Not enough SOL left to satisfy rent rules. Top up a little SOL, or send Max / leave at least 0.00089 SOL.';
  }
  if (/insufficient lamports|insufficient funds/.test(r)) {
    return 'Not enough SOL to cover the amount plus fees. Top up a little SOL and retry.';
  }
  if (/slippage|0x1771|exceeds desired slippage/.test(r)) {
    return 'The price moved beyond your slippage limit while executing. Nothing was lost — just try again.';
  }
  if (/blockhash|block height exceeded|expired/.test(r)) {
    return 'The network took too long and the transaction expired unsent. Safe to try again.';
  }
  if (/preflight|custom program error|#-32002/.test(r)) {
    return 'The route failed on-chain simulation — nothing was sent. Routes go stale, and very small amounts route poorly. Try again, or use a slightly larger amount (≥ 0.01 SOL / ≥ $1).';
  }
  if (/429|too many requests|timed out|gateway|504|503/.test(r)) {
    return 'A free public endpoint is rate-limiting or slow. Wait a few seconds and retry — a free helius.dev RPC key in Settings prevents this.';
  }
  return null;
}

/** Reject after `ms` so a hung connection can't freeze the UI forever. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry an idempotent async operation (RPC reads, rebroadcasts) with backoff.
 * Free public RPC tiers throw 429s on small bursts — this smooths them over.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 600): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await sleep(baseMs * (i + 1));
    }
  }
  throw lastError;
}
