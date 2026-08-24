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
