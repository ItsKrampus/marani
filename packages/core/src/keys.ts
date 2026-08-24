import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner } from '@solana/kit';

/** Phantom-compatible derivation: m/44'/501'/{account}'/0' (SLIP-0010, ed25519, all hardened). */
export const SOLANA_BIP44_PURPOSE = 44;
export const SOLANA_COIN_TYPE = 501;

export function newMnemonic(): string {
  return generateMnemonic(wordlist, 128); // 12 words
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

const HARDENED_OFFSET = 0x80000000;

function ser32(index: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, index >>> 0, false);
  return out;
}

function slip10Master(seed: Uint8Array): Slip10Node {
  const I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function slip10DeriveHardened(node: Slip10Node, index: number): Slip10Node {
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(node.key, 1);
  data.set(ser32(index + HARDENED_OFFSET), 33);
  const I = hmac(sha512, node.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/** SLIP-0010 ed25519 derivation over already-hardened path segments. */
export function slip10DerivePath(seed: Uint8Array, segments: number[]): Slip10Node {
  let node = slip10Master(seed);
  for (const index of segments) node = slip10DeriveHardened(node, index);
  return node;
}

export function derivePrivateKeyBytes(seed: Uint8Array, accountIndex = 0): Uint8Array {
  return slip10DerivePath(seed, [SOLANA_BIP44_PURPOSE, SOLANA_COIN_TYPE, accountIndex, 0]).key;
}

export async function signerFromMnemonic(mnemonic: string, accountIndex = 0): Promise<KeyPairSigner> {
  const seed = await mnemonicToSeed(normalizeMnemonic(mnemonic));
  const privateKey = derivePrivateKeyBytes(seed, accountIndex);
  return createKeyPairSignerFromPrivateKeyBytes(privateKey);
}
