import React, { useState } from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-[#d9a441]" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function CopyButton({ text, small }: { text: string; small?: boolean }) {
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
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

export function Header(props: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      {props.onBack && (
        <button className="text-zinc-400 hover:text-white text-lg leading-none cursor-pointer" onClick={props.onBack}>
          ←
        </button>
      )}
      <div className="text-base font-bold flex-1">{props.title}</div>
      {props.right}
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  // Qvevri (Georgian wine vessel) mark — where you keep what's precious.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M8 4h16c0 4-1 7-3 9.5 2 2.5 3 5.5 3 8.5 0 4-3.6 6-8 6s-8-2-8-6c0-3 1-6 3-8.5C9 11 8 8 8 4z"
        fill="#8e2438"
        stroke="#d9a441"
        strokeWidth="1.5"
      />
      <path d="M12 4.5h8" stroke="#d9a441" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function FindingBadge({ level }: { level: 'block' | 'warn' | 'info' | 'ok' }) {
  const map = {
    block: ['BLOCKED', 'bg-red-950 text-red-300 border-red-800'],
    warn: ['CAUTION', 'bg-amber-950 text-amber-300 border-amber-800'],
    info: ['INFO', 'bg-sky-950 text-sky-300 border-sky-800'],
    ok: ['SAFE', 'bg-emerald-950 text-emerald-300 border-emerald-800'],
  } as const;
  const [text, cls] = map[level];
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${cls}`}>{text}</span>;
}
