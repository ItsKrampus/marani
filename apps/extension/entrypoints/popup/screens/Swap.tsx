import {
  executeSwapWithFreshRetry,
  explainTxError,
  explorerUrl,
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
import { fmtUsd, StatusBadge, TokenIcon, WaitState } from '../lib/ui';

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

type Result = null | { phase: 'pending' } | { phase: 'success'; sig: string; paid: string; received: string } | { phase: 'fail'; reason: string };

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
  const [quoteError, setQuoteError] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [prices, setPrices] = useState<Record<string, UsdPrice>>({});
  const quoteSeq = useRef(0);

  const from = fromRows.find((r) => (r.mint ?? 'SOL') === fromKey) ?? null;
  const fromInputMint = from ? (from.mint ?? WSOL_MINT) : null;
  const to = TO_OPTIONS.find((o) => o.mint === toMint)!;

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

  useEffect(() => {
    setQuote(null);
    setQuoteError('');
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
          setQuoteError((e as Error).message);
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

  const rateLine = useMemo(() => {
    if (!quote || !from) return null;
    const inAmt = Number(quote.inAmountRaw) / 10 ** from.decimals;
    const outAmt = Number(quote.outAmountRaw) / 10 ** to.decimals;
    if (inAmt <= 0) return null;
    const rate = outAmt / inAmt;
    return `1 ${from.symbol} = ${rate >= 100 ? rate.toFixed(2) : rate.toPrecision(4)} ${to.symbol}`;
  }, [quote, from, to]);

  const execute = async () => {
    if (!quote || !fromInputMint || !from) return;
    setResult({ phase: 'pending' });
    try {
      const res = await executeSwapWithFreshRetry(wallet.rpc, wallet.signer, {
        inputMint: fromInputMint,
        outputMint: toMint,
        amountRaw: quote.inAmountRaw,
        slippageBps: quote.slippageBps,
        initialQuote: quote,
      });
      if (!res.confirmed) throw new Error('Swap not confirmed — check Activity');
      setResult({
        phase: 'success',
        sig: res.signature,
        paid: `${formatRawAmount(quote.inAmountRaw, from.decimals, 6)} ${from.symbol}`,
        received: `+≈${formatRawAmount(quote.outAmountRaw, to.decimals, 6)} ${to.symbol}`,
      });
      wallet.refresh();
    } catch (e) {
      setResult({ phase: 'fail', reason: (e as Error).message });
    }
  };

  // ---------------- devnet gate: swaps ride mainnet liquidity ----------------
  if (wallet.cluster === 'devnet') {
    return (
      <div className="screen-in flex h-full flex-col">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
          <button
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] cursor-pointer"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            onClick={onBack}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="font-display flex-1 text-[17px]">{t('swap')}</span>
        </div>
        <div className="m-auto flex w-full flex-col items-center gap-4 px-6 text-center">
          <span className="pill !cursor-default" style={{ color: 'var(--gold)', borderColor: 'rgba(224,164,88,0.5)' }}>
            ◎ Devnet
          </span>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Swaps route real mainnet liquidity through Jupiter, so they're unavailable on devnet. Switch back to
            Mainnet to swap.
          </p>
          <button className="btn btn-primary w-full" onClick={() => wallet.switchCluster('mainnet')}>
            Switch to Mainnet
          </button>
        </div>
      </div>
    );
  }

  // ---------------- result screens (per design) ----------------
  if (result?.phase === 'pending') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5">
        <WaitState title={t('pendingTitle')} sub={t('pendingSub')} pad={false} />
      </div>
    );
  }
  if (result) {
    return (
      <div className="screen-in flex h-full flex-col items-center gap-4 px-5 pb-4 pt-10">
        {result.phase === 'success' && <StatusBadge kind="success" />}
        {result.phase === 'fail' && <StatusBadge kind="fail" />}

        <div className="flex flex-col items-center gap-1.5">
          <span className="font-display text-[22px] text-center">
            {result.phase === 'success' ? t('successTitle') : t('failTitle')}
          </span>
          <span className="max-w-[260px] text-center text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {result.phase === 'success' ? t('successSub') : ''}
          </span>
        </div>

        {result.phase === 'success' && (
          <div className="card flex w-full flex-col gap-2.5 !p-3.5 text-xs">
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>{t('paid')}</span><span className="font-semibold">{result.paid}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>{t('received')}</span><span className="font-semibold" style={{ color: 'var(--green)' }}>{result.received}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>{t('networkFee')}</span><span style={{ color: 'var(--text-2)' }}>~0.0002 SOL</span></div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-3)' }}>{t('txId')}</span>
              <a href={explorerUrl('tx', result.sig, wallet.cluster)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>
                {shortAddress(result.sig, 4)} ↗
              </a>
            </div>
          </div>
        )}
        {result.phase === 'fail' && (
          <div className="w-full rounded-[14px] px-3.5 py-3" style={{ background: 'rgba(255,122,138,0.06)', border: '1px solid rgba(255,122,138,0.35)' }}>
            <span className="selectable text-[11px] leading-relaxed" style={{ color: '#F3B7BE' }}>
              {explainTxError(result.reason) ?? result.reason.slice(0, 220)}
            </span>
          </div>
        )}

        <div className="flex-1" />
        {result.phase === 'success' && (
          <button className="btn btn-primary w-full" onClick={onBack}>
            {t('done')}
          </button>
        )}
        {result.phase === 'fail' && (
          <div className="flex w-full flex-col gap-2">
            <button className="btn btn-primary" onClick={() => setResult(null)}>
              {t('tryAgain')}
            </button>
            <button className="btn btn-ghost" onClick={onBack}>
              {t('cancel')}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------------- swap form (per design) ----------------
  const pill = (symbol: string, logoUri: string | null, onClick: () => void) => (
    <button
      className="chip-btn flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 cursor-pointer"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      onClick={onClick}
    >
      <TokenIcon symbol={symbol} logoUri={logoUri} size={22} />
      <span className="text-[13px] font-semibold">{symbol}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );

  return (
    <div className="screen-in relative flex h-full flex-col">
      {/* header: back chip · title · slippage pill */}
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <button
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] cursor-pointer"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          onClick={onBack}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="font-display flex-1 text-[17px]">{t('swap')}</span>
        <span className="rounded-full px-2.5 py-1.5 text-[11px]" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          {t('slippage')} {((quote?.slippageBps ?? 50) / 100).toFixed(1)}%
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-1">
        {/* pay card */}
        <div className="flex flex-col gap-2.5 rounded-[14px] p-3.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span className="label">{t('youPay')}</span>
          <div className="flex items-center gap-2.5">
            <input
              className="font-display min-w-0 flex-1 bg-transparent text-[28px] leading-tight outline-none"
              style={{ color: 'var(--text)' }}
              placeholder="0"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
            {from && pill(from.symbol, from.logoUri, () => setPicker('from'))}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: 'var(--text-3)' }} title={from ? formatRawAmount(from.amountRaw, from.decimals) : ''}>
              {from ? `${t('balanceWord')}: ${formatAmountCompact(from.amountRaw, from.decimals)} ${from.symbol}` : ''}
              {amountRaw !== null && fromInputMint && usdOf(fromInputMint, amountRaw, from!.decimals)
                ? ` · ≈ ${usdOf(fromInputMint, amountRaw, from!.decimals)}`
                : ''}
            </span>
            {from && (
              <button className="cursor-pointer font-semibold" style={{ color: 'var(--gold)' }} onClick={() => setAmountStr(formatRawAmount(maxRaw, from.decimals))}>
                {t('max')}
              </button>
            )}
          </div>
        </div>

        {/* flip */}
        <div className="z-10 -my-[24px] flex justify-center">
          <button
            className="flip-btn chip-btn flex h-[34px] w-[34px] items-center justify-center rounded-[12px] cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--bg)', border: '1px solid var(--border-accent)' }}
            disabled={!canFlip}
            onClick={flip}
            title={canFlip ? 'Flip' : 'Flip needs a held token on the receive side'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14 M19 12l-7 7-7-7" /></svg>
          </button>
        </div>

        {/* receive card */}
        <div className="flex flex-col gap-2.5 rounded-[14px] p-3.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span className="label">{t('youReceive')}</span>
          <div className="flex items-center gap-2.5">
            {quoting ? (
              <span className="skeleton h-[30px] flex-1" style={{ maxWidth: 140 }} />
            ) : (
              <span className="font-display min-w-0 flex-1 truncate text-[28px] leading-tight" style={{ color: quote ? 'var(--text)' : 'var(--inactive)' }}>
                {quote ? formatRawAmount(quote.outAmountRaw, to.decimals, 6) : '—'}
              </span>
            )}
            {pill(to.symbol, logos[to.mint] ?? null, () => setPicker('to'))}
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {toRow
              ? `${t('balanceWord')}: ${formatAmountCompact(toRow.amountRaw, toRow.decimals)} ${to.symbol}`
              : quote && usdOf(to.mint, quote.outAmountRaw, to.decimals)
                ? `≈ ${usdOf(to.mint, quote.outAmountRaw, to.decimals)}`
                : ' '}
          </span>
        </div>

        {/* details */}
        <div className="flex flex-col gap-1.5 px-1.5 text-[11px]">
          <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>{t('rate')}</span><span style={{ color: 'var(--text-2)' }}>{rateLine ?? '—'}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>{t('networkFee')}</span><span style={{ color: 'var(--text-2)' }}>~0.0002 SOL</span></div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-3)' }}>{t('route')}</span>
            <span className="truncate pl-4" style={{ color: 'var(--text-2)' }}>
              {quote ? `Jupiter · ${Math.max(quote.routeLabels.length, 1)} hop${quote.routeLabels.length > 1 ? 's' : ''}` : 'Jupiter'}
              {quote && quote.priceImpactPct > 0.001 ? ` · ${t('impact')} ${(quote.priceImpactPct * 100).toFixed(2)}%` : ''}
            </span>
          </div>
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
        {quoteError && (
          <div className="text-[11px]" style={{ color: 'var(--red)' }}>
            {explainTxError(quoteError) ?? quoteError.slice(0, 160)}
          </div>
        )}

        <button className="btn btn-primary mt-auto !py-3.5" disabled={!quote || quoting || overMax} onClick={execute}>
          {t('swap')} {from ? `${from.symbol} → ${to.symbol}` : ''}
        </button>
      </div>

      {/* token picker overlay */}
      {picker && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ background: 'rgba(10,5,8,0.72)' }} onClick={() => setPicker(null)}>
          <div
            className="sheet-in flex max-h-[70%] flex-col gap-1.5 overflow-y-auto rounded-t-2xl p-4"
            style={{ background: 'var(--bg)', borderTop: '1px solid var(--border-accent)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="label pb-1">{picker === 'from' ? t('youPay') : t('youReceive')}</span>
            {picker === 'from'
              ? fromRows.map((r) => (
                  <button
                    key={r.mint ?? 'SOL'}
                    className="tap-row flex items-center gap-2.5 rounded-xl p-2.5 text-left cursor-pointer"
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
                    className="tap-row flex items-center gap-2.5 rounded-xl p-2.5 text-left cursor-pointer"
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
