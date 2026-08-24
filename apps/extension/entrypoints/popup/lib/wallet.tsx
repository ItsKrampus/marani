import {
  fetchTokenMeta,
  fetchUsdPrices,
  getPortfolio,
  makeRpc,
  shortAddress,
  WELL_KNOWN_TOKENS,
  WSOL_MINT,
  type KeyPairSigner,
  type SolanaRpc,
  type UsdPrice,
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
  /** USD value of the row balance, when a price is known. */
  usdValue: number | null;
  change24hPct: number | null;
}

export interface WalletCtx {
  address: string;
  signer: KeyPairSigner;
  rpc: SolanaRpc;
  rpcUrl: string;
  mnemonic: string;
  rows: TokenRow[];
  totalUsd: number | null;
  totalChangeUsd: number | null;
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

function rowAmount(row: { amountRaw: bigint; decimals: number }): number {
  return Number(row.amountRaw) / 10 ** row.decimals;
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
        const bare: Omit<TokenRow, 'usdValue' | 'change24hPct'>[] = [
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
          bare.push({
            mint: t.mint,
            symbol: meta?.symbol ?? shortAddress(t.mint),
            name: meta?.name ?? 'Unknown token',
            amountRaw: t.amountRaw,
            decimals: t.decimals,
            program: t.program,
            verified: meta?.verified === true,
          });
        }

        const priceIds = bare.map((r) => r.mint ?? WSOL_MINT);
        const prices: Record<string, UsdPrice> = await fetchUsdPrices([...new Set(priceIds)]);
        const withPrices: TokenRow[] = bare.map((r) => {
          const p = prices[r.mint ?? WSOL_MINT];
          return {
            ...r,
            usdValue: p ? rowAmount(r) * p.usd : null,
            change24hPct: p?.change24hPct ?? null,
          };
        });
        if (!cancelled) setRows(withPrices);
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

  const totalUsd = rows.length && rows.some((r) => r.usdValue !== null)
    ? rows.reduce((s, r) => s + (r.usdValue ?? 0), 0)
    : null;
  const totalChangeUsd =
    totalUsd !== null
      ? rows.reduce((s, r) => {
          if (r.usdValue === null || r.change24hPct === null) return s;
          const prev = r.usdValue / (1 + r.change24hPct / 100);
          return s + (r.usdValue - prev);
        }, 0)
      : null;

  const value: WalletCtx = {
    address: signer.address,
    signer,
    rpc,
    rpcUrl,
    mnemonic,
    rows,
    totalUsd,
    totalChangeUsd,
    loading,
    loadError,
    refresh,
    lock: onLock,
  };
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
