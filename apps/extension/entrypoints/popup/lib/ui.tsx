import { explainTxError, shortAddress } from '@marani/core';
import React, { useState } from 'react';
import { usePrefs } from './prefs';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
      <div
        className="h-4 w-4 animate-spin rounded-full border-2"
        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }}
      />
      {label ?? 'Loading…'}
    </div>
  );
}

/** Full branded waiting state — breathing qvevri in a spinning gold ring. */
export function WaitState({ title, sub, pad = true }: { title: string; sub?: string; pad?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-4 ${pad ? 'pt-10' : ''}`}>
      <div className="relative flex h-[96px] w-[96px] items-center justify-center">
        <div className="qvevri-ring absolute inset-0" />
        <div
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full"
          style={{ background: 'var(--card)', border: '1px solid var(--border-accent)' }}
        >
          <span className="qvevri-breathe flex">
            <Logo size={32} />
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="font-display text-center text-[20px]">{title}</span>
        {sub && (
          <span className="max-w-[250px] text-center text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

/** Animated result badge — springy pop, stroke draws itself in. Replaces ✅/❌ emojis. */
export function StatusBadge({ kind, size = 78 }: { kind: 'success' | 'fail'; size?: number }) {
  const ok = kind === 'success';
  const color = ok ? '#9FE8C1' : '#FF7A8A';
  return (
    <span
      className="pop-in flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: ok ? 'rgba(159,232,193,0.08)' : 'rgba(255,122,138,0.08)',
        border: `2px solid ${color}`,
      }}
    >
      <svg
        width={Math.round(size * 0.44)}
        height={Math.round(size * 0.44)}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ok ? (
          <path className="stroke-draw" pathLength={1} d="M4 12.5l5 5 11-11" />
        ) : (
          <>
            <path className="stroke-draw" pathLength={1} d="M6 6l12 12" />
            <path className="stroke-draw" pathLength={1} d="M18 6L6 18" />
          </>
        )}
      </svg>
    </span>
  );
}

/** Guardian shield with a check — the rescue/safety mark. Replaces the 🛟 emoji. */
export function ShieldIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 3.5V11c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V5.5L12 2z" />
      <path d="M8.5 12l2.3 2.3 4.7-4.8" />
    </svg>
  );
}

const KIND_ICON_PATHS: Record<'sent' | 'received' | 'swap', string> = {
  sent: 'M12 19V5 M5 12l7-7 7 7',
  received: 'M12 5v14 M19 12l-7 7-7-7',
  swap: 'M7 16V4 M3 8l4-4 4 4 M17 8v12 M13 16l4 4 4-4',
};

/** Tiny direction glyph for activity badges (crisp SVG instead of unicode arrows). */
export function KindIcon({ kind, size = 9, color }: { kind: 'sent' | 'received' | 'swap' | 'app'; size?: number; color: string }) {
  if (kind === 'app') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4.5" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d={KIND_ICON_PATHS[kind]} />
    </svg>
  );
}

/** Shimmering placeholder rows shaped like asset/activity cards. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-xl p-2.5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', opacity: 1 - i * 0.18 }}
        >
          <span className="skeleton h-8 w-8 shrink-0 !rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="skeleton h-3 w-24" />
            <span className="skeleton h-2.5 w-16" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="skeleton h-3 w-14" />
            <span className="skeleton h-2.5 w-9" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Shimmering placeholder block (charts, panels). */
export function SkeletonBlock({ height }: { height: number }) {
  return <span className="skeleton block w-full" style={{ height }} />;
}

export function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const { t } = usePrefs();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`btn btn-ghost ${small ? 'px-2 py-1 text-xs' : ''}`}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? t('copied') : t('copy')}
    </button>
  );
}

export function Header(props: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      {props.onBack && (
        <button
          className="text-lg leading-none cursor-pointer"
          style={{ color: 'var(--text-3)' }}
          onClick={props.onBack}
        >
          ←
        </button>
      )}
      <div className="font-display text-base flex-1">{props.title}</div>
      {props.right}
    </div>
  );
}

/** Marani qvevri mark — from the brand design project. */
export function Logo({ size = 24 }: { size?: number }) {
  const h = Math.round((size * 140) / 120);
  return (
    <svg width={size} height={h} viewBox="0 0 120 140" fill="none">
      <path
        d="M45 12 h30 c2 0 3 1 3 3 v7 c16 8 26 24 26 44 c0 30 -18 54 -44 62 c-26 -8 -44 -32 -44 -62 c0 -20 10 -36 26 -44 v-7 c0 -2 1 -3 3 -3 z"
        fill="#7A1533"
      />
      <circle cx="60" cy="54" r="11" fill="#14090E" />
      <circle cx="60" cy="54" r="11" stroke="#E0A458" strokeWidth="3" fill="none" />
      <path d="M4 76 h18 M98 76 h18" stroke="#E0A458" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FindingBadge({ level }: { level: 'block' | 'warn' | 'info' | 'ok' }) {
  const map = {
    block: ['BLOCKED', { background: '#2A0D1B', color: '#FF7A8A', borderColor: '#7A1533' }],
    warn: ['CAUTION', { background: '#2A2010', color: '#E0A458', borderColor: '#6B4E1F' }],
    info: ['INFO', { background: '#1F161E', color: '#B7ACA8', borderColor: '#33272F' }],
    ok: ['SAFE', { background: '#0E2018', color: '#9FE8C1', borderColor: '#2E5A45' }],
  } as const;
  const [text, style] = map[level];
  return (
    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider" style={style}>
      {text}
    </span>
  );
}

/** Top chrome bar: mark, account pill, network pill, avatar → settings. */
export function TopBar(props: { address: string; onAvatar: () => void }) {
  const { t } = usePrefs();
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: '1px solid var(--border-soft)' }}
    >
      <div className="flex items-center gap-2">
        <Logo size={20} />
        <button
          className="pill"
          onClick={async () => {
            await navigator.clipboard.writeText(props.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <span className="flex h-[7px] w-[7px] rounded-full" style={{ background: 'var(--green)' }} />
          <span className="text-xs font-semibold">{copied ? t('copied') : t('account')}</span>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-3)' }}>
            {shortAddress(props.address, 4)}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="pill !cursor-default" style={{ color: 'var(--text-2)' }}>
          ◎ Solana
        </span>
        <button
          className="avatar-btn h-7 w-7 rounded-full cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #7A1533, #E0A458)' }}
          onClick={props.onAvatar}
          title={t('settings')}
        />
      </div>
    </div>
  );
}

export type Tab = 'home' | 'cellar' | 'activity' | 'settings';

const TAB_ICONS: Record<Tab, string> = {
  home: 'M3 10.5 L12 3 l9 7.5 M5 9.5 V21 h14 V9.5',
  cellar: 'M9 3 h6 v3 c4 2 6 5.5 6 9.5 c0 3 -4 5.5 -9 5.5 c-5 0 -9 -2.5 -9 -5.5 c0 -4 2 -7.5 6 -9.5 z',
  activity: 'M3 12 h4 l3 -7 4 14 3 -7 h4',
  settings:
    'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M12 2v3 M12 19v3 M4.9 4.9l2.2 2.2 M16.9 16.9l2.2 2.2 M2 12h3 M19 12h3 M4.9 19.1l2.2-2.2 M16.9 7.1l2.2-2.2',
};

export function BottomNav({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  const { t } = usePrefs();
  const tabs: Tab[] = ['home', 'cellar', 'activity', 'settings'];
  return (
    <div
      className="grid grid-cols-4"
      style={{ borderTop: '1px solid var(--border-soft)', background: 'var(--bg-nav)' }}
    >
      {tabs.map((tab) => {
        const color = tab === active ? 'var(--gold)' : 'var(--inactive)';
        return (
          <button key={tab} className="nav-tab flex flex-col items-center gap-[3px] pb-3 pt-2.5 cursor-pointer" onClick={() => onSelect(tab)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={TAB_ICONS[tab]} />
            </svg>
            <span className="text-[10px] font-semibold" style={{ color }}>
              {t(tab)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Error display: human explanation up front, raw details collapsed behind a toggle, always copyable. */
export function ErrorNote({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const friendly = explainTxError(text);
  const [showRaw, setShowRaw] = useState(!friendly);
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-xl p-3"
      style={{ background: '#2A0D1B', border: '1px solid #7A1533' }}
    >
      <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text)' }}>
        {friendly ?? 'Something went wrong.'}
      </div>
      {showRaw && (
        <div
          className="selectable min-w-0 rounded-lg p-2 font-mono text-[10px] leading-relaxed"
          style={{ color: 'var(--red)', background: 'rgba(0,0,0,0.35)', overflowWrap: 'anywhere' }}
        >
          {text}
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn btn-ghost !px-2.5 !py-1 text-[10px]" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide details' : 'Details'}
        </button>
        <button
          className="btn btn-ghost !px-2.5 !py-1 text-[10px]"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? 'Copied ✓' : 'Copy error'}
        </button>
      </div>
    </div>
  );
}

/** 24h price area chart in brand colors — green when up, red when down. */
export function Sparkline({ points, width = 335, height = 92 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || max * 0.001 || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  const up = points[points.length - 1]! >= points[0]!;
  const color = up ? '#9FE8C1' : '#FF7A8A';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="spark-area" d={area} fill="url(#spark-fill)" />
      <path
        className="spark-line"
        d={line}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function fmtUsd(n: number): string {
  return usdFormat.format(n);
}

export function pctText(pct: number | null): { text: string; color: string } {
  if (pct === null || !Number.isFinite(pct)) return { text: '', color: 'var(--text-3)' };
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  const color = rounded > 0 ? 'var(--green)' : rounded < 0 ? 'var(--red)' : 'var(--text-3)';
  return { text: `${sign}${Math.abs(rounded).toFixed(1)}%`, color };
}

/** Brand colors for token circles, keyed by symbol (design palette). */
export function tokenColor(symbol: string): string {
  const map: Record<string, string> = {
    SOL: '#B99AE8',
    USDC: '#A8C4E8',
    USDG: '#E0A458',
    USDT: '#9FE8C1',
    PYUSD: '#A8C4E8',
    JUP: '#B99AE8',
    BONK: '#F0B26B',
  };
  if (map[symbol]) return map[symbol];
  const palette = ['#B99AE8', '#A8C4E8', '#E0A458', '#F0B26B', '#9FE8C1'];
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

/** Real token logo when available (Jupiter Token API), branded circle fallback otherwise. */
export function TokenIcon({ symbol, logoUri, size = 32 }: { symbol: string; logoUri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!logoUri || failed) return <TokenCircle symbol={symbol} size={size} />;
  return (
    <img
      src={logoUri}
      width={size}
      height={size}
      className="rounded-full"
      style={{ background: 'var(--card)', width: size, height: size, objectFit: 'cover' }}
      onError={() => setFailed(true)}
      alt=""
    />
  );
}

export function TokenCircle({ symbol, size = 32 }: { symbol: string; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: tokenColor(symbol),
        color: '#14090E',
        fontSize: size * 0.38,
      }}
    >
      {symbol === 'SOL' || symbol === 'wSOL' ? '◎' : symbol.slice(0, 1)}
    </span>
  );
}
