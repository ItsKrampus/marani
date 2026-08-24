import type { VaultData } from '@marani/core';
import type { ExchangeId } from '@marani/preflight';
import { browser } from 'wxt/browser';

export interface Settings {
  rpcUrl: string;
}

export type UserMarks = Record<string, ExchangeId | 'not-cex'>;

export interface CachedTokenMeta {
  symbol: string;
  name: string;
  verified?: boolean;
}

const local = browser.storage.local;
// storage.session is MV3-only; typing lags in some polyfills.
const session: typeof browser.storage.local | undefined = (browser.storage as never as { session?: typeof browser.storage.local }).session;

async function getKey<T>(area: typeof browser.storage.local | undefined, key: string): Promise<T | null> {
  if (!area) return null;
  try {
    const out = await area.get(key);
    return (out?.[key] as T | undefined) ?? null;
  } catch {
    return null;
  }
}

async function setKey(area: typeof browser.storage.local | undefined, key: string, value: unknown): Promise<void> {
  if (!area) return;
  try {
    await area.set({ [key]: value });
  } catch {
    /* storage failures must never crash the wallet UI */
  }
}

export const getVault = () => getKey<VaultData>(local, 'vault');
export const setVault = (v: VaultData) => setKey(local, 'vault', v);
export const clearAll = async () => {
  await local.clear();
  await session?.clear().catch(() => {});
};

/** rpcUrl '' means "auto — probe public endpoints and use the first that works". */
export const getSettings = async (): Promise<Settings> => (await getKey<Settings>(local, 'settings')) ?? { rpcUrl: '' };
export const setSettings = (s: Settings) => setKey(local, 'settings', s);

export const getUserMarks = async (): Promise<UserMarks> => (await getKey<UserMarks>(local, 'userMarks')) ?? {};
export const setUserMark = async (address: string, mark: ExchangeId | 'not-cex') => {
  const marks = await getUserMarks();
  marks[address] = mark;
  await setKey(local, 'userMarks', marks);
};

export const getMetaCache = async (): Promise<Record<string, CachedTokenMeta>> =>
  (await getKey<Record<string, CachedTokenMeta>>(local, 'tokenMeta')) ?? {};
export const putMetaCache = async (mint: string, meta: CachedTokenMeta) => {
  const cache = await getMetaCache();
  cache[mint] = meta;
  await setKey(local, 'tokenMeta', cache);
};

/** Session-cached RPC endpoint pick so we don't re-probe on every popup open. */
export const getRpcPick = () => getKey<{ url: string; at: number }>(session, 'rpcPick');
export const setRpcPick = (url: string) => setKey(session, 'rpcPick', { url, at: Date.now() });

/** Decrypted mnemonic parked in session storage: memory-only, cleared when the browser closes. */
export const getSessionMnemonic = () => getKey<string>(session, 'mnemonic');
export const setSessionMnemonic = (m: string) => setKey(session, 'mnemonic', m);
export const clearSessionMnemonic = async () => {
  try {
    await session?.remove('mnemonic');
  } catch {
    /* ignore */
  }
};
