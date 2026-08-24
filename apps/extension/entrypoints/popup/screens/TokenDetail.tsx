import { fetchPriceHistory, formatAmountCompact, formatRawAmount, shortAddress, WSOL_MINT, type PricePoint } from '@marani/core';
import React, { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { type TokenRow } from '../lib/wallet';
import { fmtUsd, Header, pctText, Sparkline, Spinner, TokenIcon } from '../lib/ui';

export default function TokenDetail(props: {
  row: TokenRow;
  onBack: () => void;
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
}) {
  const { row } = props;
  const { t, mask } = usePrefs();
  const [history, setHistory] = useState<PricePoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    fetchPriceHistory(row.mint ?? WSOL_MINT).then((points) => {
      if (!cancelled) setHistory(points);
    });
    return () => {
      cancelled = true;
    };
  }, [row.mint]);

  const lastPrice = history && history.length > 1 ? history[history.length - 1]!.price : null;
  const firstPrice = history && history.length > 1 ? history[0]!.price : null;
  const chartChangePct = lastPrice !== null && firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : row.change24hPct;
  const pc = pctText(chartChangePct);
  const unitPrice = lastPrice ?? (row.usdValue !== null && row.amountRaw > 0n ? row.usdValue / (Number(row.amountRaw) / 10 ** row.decimals) : null);

  const actions = [
    { label: t('send'), icon: 'M12 19V5 M5 12l7-7 7 7', onClick: props.onSend },
    { label: t('receive'), icon: 'M12 5v14 M19 12l-7 7-7-7', onClick: props.onReceive },
    { label: t('swap'), icon: 'M7 16V4 M3 8l4-4 4 4 M17 8v12 M13 16l4 4 4-4', onClick: props.onSwap },
  ];

  return (
    <div className="flex h-full flex-col">
      <Header title={row.name} onBack={props.onBack} />
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {/* price header */}
        <div className="flex items-center gap-3">
          <TokenIcon symbol={row.symbol} logoUri={row.logoUri} size={40} />
          <div className="flex flex-col">
            <span className="font-display text-[26px] leading-tight">
              {unitPrice !== null ? fmtUsd(unitPrice) : row.symbol}
            </span>
            <span className="text-xs" style={{ color: pc.color }}>
              {pc.text ? `${pc.text} · 24h` : ' '}
            </span>
          </div>
          {row.program === 'token-2022' && (
            <span
              className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{ background: '#2A0D1B', color: 'var(--gold)', border: '1px solid var(--border-accent)' }}
            >
              TOKEN-2022
            </span>
          )}
        </div>

        {/* chart */}
        <div className="card !p-2">
          {history === null && (
            <div className="flex h-[92px] items-center justify-center">
              <Spinner label="Loading chart…" />
            </div>
          )}
          {history !== null && history.length > 1 && <Sparkline points={history.map((p) => p.price)} />}
          {history !== null && history.length <= 1 && (
            <div className="flex h-[92px] items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
              No chart data for this token
            </div>
          )}
        </div>

        {/* actions */}
        <div className="grid grid-cols-3 gap-2">
          {actions.map((a) => (
            <button key={a.label} className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={a.onClick}>
              <span
                className="flex h-11 w-11 items-center justify-center rounded-[14px]"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={a.icon} />
                </svg>
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                {a.label}
              </span>
            </button>
          ))}
        </div>

        {/* holdings */}
        <div className="card flex items-center justify-between !py-3">
          <div className="flex flex-col">
            <span className="label">Balance</span>
            <span className="text-sm font-semibold" title={`${formatRawAmount(row.amountRaw, row.decimals)} ${row.symbol}`}>
              {mask(`${formatAmountCompact(row.amountRaw, row.decimals)} ${row.symbol}`)}
            </span>
          </div>
          <span className="text-sm font-semibold">{mask(row.usdValue !== null ? fmtUsd(row.usdValue) : '—')}</span>
        </div>

        {/* mint info */}
        {row.mint && (
          <a
            className="card flex items-center justify-between !py-3"
            href={`https://solscan.io/token/${row.mint}`}
            target="_blank"
            rel="noreferrer"
          >
            <div className="flex flex-col">
              <span className="label">Mint</span>
              <span className="selectable font-mono text-xs">{shortAddress(row.mint, 8)}</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--gold)' }}>
              Solscan ↗
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
