import {
  getPortfolio,
  makeRpc,
  WELL_KNOWN_TOKENS,
  fetchTokenMeta,
  shortAddress,
  type KeyPairSigner,
  type SolanaRpc,
} from '@marani/core';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMetaCache, putMetaCache } from './storage';

export interface TokenRow {
  /** null = native SOL */
  mint: string | null;
  symbol: string;
  name: string;
  amountRaw: bigint;
  decimals: number;
  program: 'token' | 'token-2022' | null;
  verified: boolean;
}

export interface WalletCtx {
  address: string;
  signer: KeyPairSigner;
  rpc: SolanaRpc;
  rpcUrl: string;
  mnemonic: string;
  rows: TokenRow[];
  loading: boolean;
  loadError: string | null;
  refresh: () => void;
  lock: () => void;
}

const Ctx = createContext<WalletCtx | null>(null);

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet outside provider');
  return ctx;
}

export function WalletProvider(props: {
  signer: KeyPairSigner;
  mnemonic: string;
  rpcUrl: string;
  onLock: () => void;
  children: React.ReactNode;
}) {
  const { signer, mnemonic, rpcUrl, onLock } = props;
  const rpc = useMemo(() => makeRpc(rpcUrl), [rpcUrl]);
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const portfolio = await getPortfolio(rpc, signer.address);
        const cache = await getMetaCache();
        const out: TokenRow[] = [
          {
            mint: null,
            symbol: 'SOL',
            name: 'Solana',
            amountRaw: portfolio.lamports,
            decimals: 9,
            program: null,
            verified: true,
          },
        ];
        for (const t of portfolio.tokens) {
          const known = WELL_KNOWN_TOKENS[t.mint];
          let meta = known ?? cache[t.mint] ?? null;
          if (!meta) {
            const fetched = await fetchTokenMeta(t.mint);
            if (fetched) {
              meta = { symbol: fetched.symbol, name: fetched.name, verified: fetched.verified };
              await putMetaCache(t.mint, meta);
            }
          }
          out.push({
            mint: t.mint,
            symbol: meta?.symbol ?? shortAddress(t.mint),
            name: meta?.name ?? 'Unknown token',
            amountRaw: t.amountRaw,
            decimals: t.decimals,
            program: t.program,
            verified: meta?.verified === true,
          });
        }
        if (!cancelled) setRows(out);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc, signer.address, nonce]);

  const value: WalletCtx = {
    address: signer.address,
    signer,
    rpc,
    rpcUrl,
    mnemonic,
    rows,
    loading,
    loadError,
    refresh,
    lock: onLock,
  };
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
