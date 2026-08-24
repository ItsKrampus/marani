import {
  fetchTokenMeta,
  fetchUsdPrices,
  getPortfolio,
  makeRpc,
  pickRpcUrl,
  shortAddress,
  WELL_KNOWN_TOKENS,
  WSOL_MINT,
  type KeyPairSigner,
  type Portfolio,
  type SolanaRpc,
  type UsdPrice,
} from '@marani/core';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getMetaCache, putMetaCache, setRpcPick, type CachedTokenMeta } from './storage';

export interface TokenRow {
  /** null = native SOL */
  mint: string | null;
  symbol: string;
  name: string;
  amountRaw: bigint;
  decimals: number;
  program: 'token' | 'token-2022' | null;
  verified: boolean;
  logoUri: string | null;
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

function buildRows(
  portfolio: Portfolio,
  metaCache: Record<string, CachedTokenMeta>,
  prices: Record<string, UsdPrice>,
): TokenRow[] {
  const priced = (mint: string | null, base: Omit<TokenRow, 'usdValue' | 'change24hPct'>): TokenRow => {
    const p = prices[mint ?? WSOL_MINT];
    return {
      ...base,
      usdValue: p ? rowAmount(base) * p.usd : null,
      change24hPct: p?.change24hPct ?? null,
    };
  };

  const rows: TokenRow[] = [
    priced(null, {
      mint: null,
      symbol: 'SOL',
      name: 'Solana',
      amountRaw: portfolio.lamports,
      decimals: 9,
      program: null,
      verified: true,
      logoUri: metaCache[WSOL_MINT]?.logoUri ?? null,
    }),
  ];
  for (const t of portfolio.tokens) {
    const known = WELL_KNOWN_TOKENS[t.mint];
    const cached = metaCache[t.mint];
    rows.push(
      priced(t.mint, {
        mint: t.mint,
        symbol: known?.symbol ?? cached?.symbol ?? shortAddress(t.mint),
        name: known?.name ?? cached?.name ?? 'Unknown token',
        amountRaw: t.amountRaw,
        decimals: t.decimals,
        program: t.program,
        verified: known ? true : cached?.verified === true,
        logoUri: cached?.logoUri ?? null,
      }),
    );
  }
  return rows;
}

export function WalletProvider(props: {
  signer: KeyPairSigner;
  mnemonic: string;
  rpcUrl: string;
  /** true when the RPC was auto-picked (not pinned in Settings) — enables failover. */
  rpcIsAuto: boolean;
  onLock: () => void;
  children: React.ReactNode;
}) {
  const { signer, mnemonic, rpcIsAuto, onLock } = props;
  const [activeRpcUrl, setActiveRpcUrl] = useState(props.rpcUrl);
  useEffect(() => setActiveRpcUrl(props.rpcUrl), [props.rpcUrl]);
  const rpc = useMemo(() => makeRpc(activeRpcUrl), [activeRpcUrl]);

  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const failedOver = useRef(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      let portfolio: Portfolio;
      try {
        portfolio = await getPortfolio(rpc, signer.address);
      } catch (e) {
        if (cancelled) return;
        // Auto mode: the picked endpoint may have started hanging — re-probe once and switch.
        if (rpcIsAuto && !failedOver.current) {
          failedOver.current = true;
          const fresh = await pickRpcUrl().catch(() => null);
          if (!cancelled && fresh && fresh !== activeRpcUrl) {
            await setRpcPick(fresh);
            setActiveRpcUrl(fresh); // re-runs this effect with the new endpoint
            return;
          }
        }
        setLoadError((e as Error).message);
        setLoading(false);
        return;
      }
      if (cancelled) return;

      // Phase 1 — show balances immediately from static + cached metadata.
      const cache = await getMetaCache();
      setRows(buildRows(portfolio, cache, {}));
      setLoading(false);

      // Phase 2 — enrich with logos and USD prices in the background (fail-soft).
      try {
        const mints = [WSOL_MINT, ...portfolio.tokens.map((t) => t.mint)];
        for (const mint of mints) {
          if (cache[mint]?.logoUri) continue;
          const fetched = await fetchTokenMeta(mint);
          if (fetched) {
            cache[mint] = {
              symbol: fetched.symbol,
              name: fetched.name,
              verified: fetched.verified,
              logoUri: fetched.logoUri,
            };
            await putMetaCache(mint, cache[mint]!);
          }
          if (cancelled) return;
        }
        const prices = await fetchUsdPrices([...new Set(mints)]);
        if (!cancelled) setRows(buildRows(portfolio, cache, prices));
      } catch {
        /* enrichment is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc, signer.address, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUsd =
    rows.length && rows.some((r) => r.usdValue !== null) ? rows.reduce((s, r) => s + (r.usdValue ?? 0), 0) : null;
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
    rpcUrl: activeRpcUrl,
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
