import { base64ToBytes, bytesToBase64 } from './util.js';

/** Encrypted-at-rest mnemonic vault. AES-256-GCM with a PBKDF2-SHA256 password key. */
export interface VaultData {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

const ITERATIONS = 310_000;

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const passKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptVault(mnemonic: string, password: string): Promise<VaultData> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(mnemonic),
  );
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ct)),
  };
}

/** Throws on wrong password (AES-GCM auth failure). */
export async function decryptVault(vault: VaultData, password: string): Promise<string> {
  const key = await deriveAesKey(password, base64ToBytes(vault.salt), vault.iterations);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(vault.iv) as BufferSource },
    key,
    base64ToBytes(vault.ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}
