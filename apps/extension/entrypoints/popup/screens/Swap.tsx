import {
  executeSwapWithFreshRetry,
  fetchTokenMeta,
  fetchUsdPrices,
  formatAmountCompact,
  formatRawAmount,
  getSwapQuote,
  parseAmount,
  shortAddress,
  USDC_MINT,
  USDG_MINT,
  WSOL_MINT,
  type JupQuote,
  type UsdPrice,
} from '@marani/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { getMetaCache, putMetaCache } from '../lib/storage';
import { useWallet, type TokenRow } from '../lib/wallet';
import { ErrorNote, fmtUsd, Header, Spinner, TokenIcon } from '../lib/ui';

const SWAP_SOL_FEE_BUFFER = 3_000_000n; // fee + temp wSOL wrap rent

const TO_OPTIONS: Array<{ mint: string; symbol: string; name: string; decimals: number }> = [
  { mint: USDC_MINT, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { mint: USDG_MINT, symbol: 'USDG', name: 'Global Dollar', decimals: 6 },
  { mint: WSOL_MINT, symbol: 'SOL', name: 'Solana', decimals: 9 },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6 },
  { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'jitoSOL', name: 'Jito staked SOL', decimals: 9 },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5 },
  { mint: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', symbol: 'TRUMP', name: 'Official Trump', decimals: 6 },
];

export default function Swap({ onBack, presetFrom }: { onBack: () => void; presetFrom?: { mint: string | null; amountRaw: bigint } | null }) {
  const wallet = useWallet();
  const { t } = usePrefs();
  const fromRows = wallet.rows.filter((r) => r.amountRaw > 0n);
  const [fromKey, setFromKey] = useState<string>(
    presetFrom && presetFrom.amountRaw > 0n ? (presetFrom.mint ?? 'SOL') : fromRows[0] ? (fromRows[0].mint ?? 'SOL') : '',
  );
  const [toMint, setToMint] = useState(USDC_MINT);
  const [amountStr, setAmountStr] = useState('');
  const [quote, setQuote] = useState<JupQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [sig, setSig] = useState('');
  const [done, setDone] = useState(false);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [prices, setPrices] = useState<Record<string, UsdPrice>>({});
  const quoteSeq = useRef(0);

  const from = fromRows.find((r) => (r.mint ?? 'SOL') === fromKey) ?? null;
  const fromInputMint = from ? (from.mint ?? WSOL_MINT) : null;
  const to = TO_OPTIONS.find((o) => o.mint === toMint)!;

  // Logos + USD prices for the fixed "to" options (cache-first, one fetch each).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = await getMetaCache();
      const out: Record<string, string | null> = {};
      for (const o of TO_OPTIONS) {
        const row = wallet.rows.find((r) => (o.mint === WSOL_MINT ? r.mint === null : r.mint === o.mint));
        let logo = row?.logoUri ?? cache[o.mint]?.logoUri ?? null;
        if (!logo) {
          const meta = await fetchTokenMeta(o.mint);
          if (meta?.logoUri) {
            logo = meta.logoUri;
            await putMetaCache(o.mint, { symbol: meta.symbol, name: meta.name, verified: meta.verified, logoUri: meta.logoUri });
          }
        }
        out[o.mint] = logo;
        if (cancelled) return;
      }
      if (!cancelled) setLogos(out);
      const mints = [...new Set([...TO_OPTIONS.map((o) => o.mint), ...wallet.rows.map((r) => r.mint ?? WSOL_MINT)])];
      const p = await fetchUsdPrices(mints);
      if (!cancelled) setPrices(p);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountRaw = useMemo(() => {
    if (!from || !amountStr) return null;
    try {
      const raw = parseAmount(amountStr, from.decimals);
      return raw > 0n ? raw : null;
    } catch {
      return null;
    }
  }, [amountStr, from]);

  const maxRaw = from
    ? from.mint === null
      ? from.amountRaw > SWAP_SOL_FEE_BUFFER
        ? from.amountRaw - SWAP_SOL_FEE_BUFFER
        : 0n
      : from.amountRaw
    : 0n;
  const overMax = amountRaw !== null && amountRaw > maxRaw;
  const tinySol = from?.mint === null && amountRaw !== null && !overMax && amountRaw < 10_000_000n;

  // Live quoting, debounced.
  useEffect(() => {
    setQuote(null);
    setError('');
    if (!fromInputMint || amountRaw === null || overMax || fromInputMint === toMint) {
      setQuoting(false);
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const q = await getSwapQuote({ inputMint: fromInputMint, outputMint: toMint, amountRaw });
        if (quoteSeq.current === seq) {
          setQuote(q);
          setQuoting(false);
        }
      } catch (e) {
        if (quoteSeq.current === seq) {
          setError((e as Error).message);
          setQuoting(false);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fromInputMint, toMint, amountRaw, overMax]);

  const usdOf = (mint: string, raw: bigint, decimals: number): string | null => {
    const p = prices[mint];
    if (!p) return null;
    return fmtUsd((Number(raw) / 10 ** decimals) * p.usd);
  };

  const toRow = wallet.rows.find((r) => (toMint === WSOL_MINT ? r.mint === null : r.mint === toMint));
  const fromInToOptions = fromInputMint !== null && TO_OPTIONS.some((o) => o.mint === fromInputMint);
  const canFlip = Boolean(toRow && toRow.amountRaw > 0n && fromInToOptions);
  const flip = () => {
    if (!canFlip || !fromInputMint) return;
    setFromKey(toMint === WSOL_MINT ? 'SOL' : toMint);
    setToMint(fromInputMint);
    setAmountStr('');
  };

  const execute = async () => {
    if (!quote || !fromInputMint) return;
    setExecuting(true);
    setError('');
    try {
      const res = await executeSwapWithFreshRetry(wallet.rpc, wallet.signer, {
        inputMint: fromInputMint,
        outputMint: toMint,
        amountRaw: quote.inAmountRaw,
        slippageBps: quote.slippageBps,
        initialQuote: quote,
      });
      if (!res.confirmed) throw new Error('Swap not confirmed — check Activity');
      setSig(res.signature);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  if (done) {
    return (
      <div className="flex h-full flex-col">
        <Header title={t('swap')} onBack={onBack} />
        <div className="m-auto flex w-full flex-col items-center gap-3 px-4 text-center">
          <div className="text-4xl">✅</div>
          <div className="text-sm font-bold">
            Swapped {from?.symbol} → {to.symbol}
          </div>
          <a className="card w-full !py-2 text-xs" style={{ color: 'var(--gold)' }} href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">
            View on Solscan ↗
            <div className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{shortAddress(sig, 10)}</div>
          </a>
          <button className="btn btn-primary w-full" onClick={onBack}>
            {t('done')}
          </button>
        </div>
      </div>
    );
  }

  const pill = (symbol: string, logoUri: string | null, onClick: () => void) => (
    <button
      className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 cursor-pointer"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      onClick={onClick}
    >
      <TokenIcon symbol={symbol} logoUri={logoUri} size={22} />
      <span className="text-[13px] font-bold">{symbol}</span>
      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
        ▾
      </span>
    </button>
  );

  return (
    <div className="relative flex h-full flex-col">
      <Header title={t('swap')} onBack={onBack} />
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4 pt-1">
        {/* pay card */}
        <div className="flex flex-col gap-2.5 rounded-2xl p-3.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-3)' }}>
            <span className="label">{t('youPay')}</span>
            {from && (
              <span title={formatRawAmount(from.amountRaw, from.decimals)}>
                {t('balanceWord')} {formatAmountCompact(from.amountRaw, from.decimals)} ·{' '}
                <button className="cursor-pointer font-semibold" style={{ color: 'var(--gold)' }} onClick={() => setAmountStr(formatRawAmount(maxRaw, from.decimals))}>
                  {t('max')}
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <input
              className="font-display min-w-0 flex-1 bg-transparent text-[30px] leading-tight outline-none"
              style={{ color: 'var(--text)' }}
              placeholder="0"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
            {from && pill(from.symbol, from.logoUri, () => setPicker('from'))}
          </div>
          <span className="text-[10px]" style={{ color: 'var(--inactive)' }}>
            {amountRaw !== null && fromInputMint ? (usdOf(fromInputMint, amountRaw, from!.decimals) ?? ' ') : ' '}
          </span>
        </div>

        {/* flip */}
        <div className="z-10 -my-[22px] flex justify-center">
          <button
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-sm cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--bg)', border: '1px solid var(--border-accent)', color: 'var(--gold)' }}
            disabled={!canFlip}
            onClick={flip}
            title={canFlip ? 'Flip' : 'Flip needs a held token on the receive side'}
          >
            ↓
          </button>
        </div>

        {/* receive card */}
        <div className="flex flex-col gap-2.5 rounded-2xl p-3.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span className="label">{t('youReceive')}</span>
          <div className="flex items-center gap-2.5">
            <span className="font-display min-w-0 flex-1 truncate text-[30px] leading-tight" style={{ color: quote ? 'var(--green)' : 'var(--inactive)' }}>
              {quoting ? '…' : quote ? formatRawAmount(quote.outAmountRaw, to.decimals, 6) : '—'}
            </span>
            {pill(to.symbol, logos[to.mint] ?? null, () => setPicker('to'))}
          </div>
          <span className="text-[10px]" style={{ color: 'var(--inactive)' }}>
            {quote ? `${usdOf(to.mint, quote.outAmountRaw, to.decimals) ?? ''} · ${t('impact')} ${(quote.priceImpactPct * 100).toFixed(2)}%` : ' '}
          </span>
        </div>

        {/* route / slippage */}
        <div className="flex items-center justify-between px-1.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
          <span className="truncate">
            {t('route')}: {quote ? quote.routeLabels.slice(0, 3).join(' · ') || 'Jupiter' : 'Jupiter'}
          </span>
          <span>
            {t('slippage')}: {((quote?.slippageBps ?? 50) / 100).toFixed(1)}%
          </span>
        </div>

        {overMax && (
          <div className="text-xs" style={{ color: 'var(--red)' }}>
            Exceeds available balance{from?.mint === null ? ' (0.003 SOL kept for fees)' : ''}.
          </div>
        )}
        {tinySol && (
          <div className="text-[11px]" style={{ color: 'var(--gold)' }}>
            Very small swaps often fail to route — 0.01 SOL or more is reliable.
          </div>
        )}
        {error && <ErrorNote text={error} />}
        {executing && <Spinner label={`Swapping ${from?.symbol} → ${to.symbol}…`} />}

        <button className="btn btn-primary mt-auto" disabled={!quote || quoting || executing || overMax} onClick={execute}>
          {t('swap')} {from ? `${from.symbol} → ${to.symbol}` : ''}
        </button>
      </div>

      {/* token picker overlay */}
      {picker && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ background: 'rgba(10,5,8,0.72)' }} onClick={() => setPicker(null)}>
          <div
            className="flex max-h-[70%] flex-col gap-1.5 overflow-y-auto rounded-t-2xl p-4"
            style={{ background: 'var(--bg)', borderTop: '1px solid var(--border-accent)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="label pb-1">{picker === 'from' ? t('youPay') : t('youReceive')}</span>
            {picker === 'from'
              ? fromRows.map((r) => (
                  <button
                    key={r.mint ?? 'SOL'}
                    className="flex items-center gap-2.5 rounded-xl p-2.5 text-left cursor-pointer"
                    style={{ background: 'var(--card)', border: `1px solid ${(r.mint ?? 'SOL') === fromKey ? 'var(--gold)' : 'var(--border)'}` }}
                    onClick={() => {
                      setFromKey(r.mint ?? 'SOL');
                      setAmountStr('');
                      setPicker(null);
                    }}
                  >
                    <TokenIcon symbol={r.symbol} logoUri={r.logoUri} size={28} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold">{r.symbol}</span>
                      <span className="truncate text-[10px]" style={{ color: 'var(--text-3)' }}>{r.name}</span>
                    </div>
                    <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                      {formatAmountCompact(r.amountRaw, r.decimals)}
                    </span>
                  </button>
                ))
              : TO_OPTIONS.filter((o) => o.mint !== fromInputMint).map((o) => (
                  <button
                    key={o.mint}
                    className="flex items-center gap-2.5 rounded-xl p-2.5 text-left cursor-pointer"
                    style={{ background: 'var(--card)', border: `1px solid ${o.mint === toMint ? 'var(--gold)' : 'var(--border)'}` }}
                    onClick={() => {
                      setToMint(o.mint);
                      setPicker(null);
                    }}
                  >
                    <TokenIcon symbol={o.symbol} logoUri={logos[o.mint] ?? null} size={28} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold">{o.symbol}</span>
                      <span className="truncate text-[10px]" style={{ color: 'var(--text-3)' }}>{o.name}</span>
                    </div>
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
