import {
  buildSwapTransaction,
  formatRawAmount,
  getSwapQuote,
  parseAmount,
  shortAddress,
  signAndSendSwap,
  USDC_MINT,
  USDG_MINT,
  WSOL_MINT,
  type JupQuote,
} from '@marani/core';
import React, { useMemo, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet } from '../lib/wallet';
import { Header, Spinner, TokenCircle } from '../lib/ui';

const SWAP_SOL_FEE_BUFFER = 3_000_000n; // fee + temp wSOL wrap rent

const TO_OPTIONS: Array<{ mint: string; symbol: string; decimals: number }> = [
  { mint: USDC_MINT, symbol: 'USDC', decimals: 6 },
  { mint: USDG_MINT, symbol: 'USDG', decimals: 6 },
  { mint: WSOL_MINT, symbol: 'SOL', decimals: 9 },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', decimals: 6 },
];

export default function Swap({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  const { t } = usePrefs();
  const fromRows = wallet.rows.filter((r) => r.amountRaw > 0n);
  const [fromKey, setFromKey] = useState<string>(fromRows[0] ? (fromRows[0].mint ?? 'SOL') : '');
  const [toMint, setToMint] = useState(USDC_MINT);
  const [amountStr, setAmountStr] = useState('');
  const [quote, setQuote] = useState<JupQuote | null>(null);
  const [phase, setPhase] = useState<'idle' | 'quoting' | 'ready' | 'swapping' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [sig, setSig] = useState('');

  const from = fromRows.find((r) => (r.mint ?? 'SOL') === fromKey) ?? null;
  const fromInputMint = from ? (from.mint ?? WSOL_MINT) : null;
  const to = TO_OPTIONS.find((o) => o.mint === toMint)!;

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

  const fetchQuote = async () => {
    if (!fromInputMint || amountRaw === null || fromInputMint === toMint) return;
    setPhase('quoting');
    setError('');
    setQuote(null);
    try {
      const q = await getSwapQuote({ inputMint: fromInputMint, outputMint: toMint, amountRaw });
      setQuote(q);
      setPhase('ready');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const execute = async () => {
    if (!quote) return;
    setPhase('swapping');
    setError('');
    try {
      const tx = await buildSwapTransaction({ quote, userPublicKey: wallet.address });
      const res = await signAndSendSwap(wallet.rpc, wallet.signer, tx);
      if (!res.confirmed) throw new Error('Swap not confirmed — check Activity');
      setSig(res.signature);
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title={t('swap')} onBack={onBack} />
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {phase === 'done' ? (
          <div className="m-auto flex w-full flex-col items-center gap-3 text-center">
            <div className="text-4xl">✅</div>
            <div className="text-sm font-bold">
              Swapped {from?.symbol} → {to.symbol}
            </div>
            <a
              className="card w-full !py-2 text-xs"
              style={{ color: 'var(--gold)' }}
              href={`https://solscan.io/tx/${sig}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Solscan ↗<div className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{shortAddress(sig, 10)}</div>
            </a>
            <button className="btn btn-primary w-full" onClick={onBack}>
              {t('done')}
            </button>
          </div>
        ) : (
          <>
            <span className="label">From</span>
            <select
              className="input"
              value={fromKey}
              onChange={(e) => {
                setFromKey(e.target.value);
                setQuote(null);
                setPhase('idle');
              }}
            >
              {fromRows.map((r) => (
                <option key={r.mint ?? 'SOL'} value={r.mint ?? 'SOL'}>
                  {r.symbol} — {formatRawAmount(r.amountRaw, r.decimals, 5)}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="0.00"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setQuote(null);
                  setPhase('idle');
                }}
              />
              <button
                className="btn btn-ghost text-xs"
                disabled={!from}
                onClick={() => from && setAmountStr(formatRawAmount(maxRaw, from.decimals))}
              >
                {t('max')}
              </button>
            </div>
            {overMax && (
              <div className="text-xs" style={{ color: 'var(--red)' }}>
                Exceeds available balance{from?.mint === null ? ' (0.003 SOL kept for fees)' : ''}.
              </div>
            )}

            <span className="label">To</span>
            <div className="grid grid-cols-4 gap-2">
              {TO_OPTIONS.filter((o) => o.mint !== fromInputMint).map((o) => (
                <button
                  key={o.mint}
                  className="flex flex-col items-center gap-1 rounded-xl p-2 cursor-pointer"
                  style={{
                    background: 'var(--card)',
                    border: `1px solid ${toMint === o.mint ? 'var(--gold)' : 'var(--border)'}`,
                  }}
                  onClick={() => {
                    setToMint(o.mint);
                    setQuote(null);
                    setPhase('idle');
                  }}
                >
                  <TokenCircle symbol={o.symbol} size={24} />
                  <span className="text-[10px] font-semibold">{o.symbol}</span>
                </button>
              ))}
            </div>

            {phase === 'quoting' && <Spinner label="Finding the best route on Jupiter…" />}
            {quote && phase === 'ready' && (
              <div className="card flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>You receive</span>
                  <span className="font-semibold">
                    ≈ {formatRawAmount(quote.outAmountRaw, to.decimals)} {to.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Price impact</span>
                  <span>{(quote.priceImpactPct * 100).toFixed(3)}%</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Route</span>
                  <span>{quote.routeLabels.join(' → ') || 'Jupiter'}</span>
                </div>
              </div>
            )}
            {phase === 'swapping' && <Spinner label={`Swapping ${from?.symbol} → ${to.symbol}…`} />}
            {error && (
              <div className="text-xs break-words" style={{ color: 'var(--red)' }}>
                {error}
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2">
              {phase === 'ready' && quote ? (
                <button className="btn btn-primary" onClick={execute}>
                  {t('swap')} {from?.symbol} → {to.symbol}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!from || amountRaw === null || overMax || fromInputMint === toMint || phase === 'quoting' || phase === 'swapping'}
                  onClick={fetchQuote}
                >
                  Get quote
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
