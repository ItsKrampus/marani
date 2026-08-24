import React from 'react';
import { usePrefs } from '../lib/prefs';
import { Logo } from '../lib/ui';

const VENUES = [
  { name: 'Lulo', detail: 'Protected stablecoin yield — USDC · USDT · USDG' },
  { name: 'Marinade', detail: 'SOL liquid staking, +0.125% partner boost' },
  { name: 'Jupiter Lend', detail: 'USDC earn — largest pool on Solana' },
];

export default function Cellar() {
  const { t } = usePrefs();
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div
        className="flex flex-col items-center gap-2 rounded-2xl px-4 py-6 text-center"
        style={{ background: 'linear-gradient(160deg, #2A0D1B, #1F161E)', border: '1px solid var(--border-accent)' }}
      >
        <Logo size={40} />
        <div className="font-display text-lg">{t('cellarTitle')}</div>
        <p className="max-w-[260px] text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {t('cellarBody')}. Georgians have buried qvevri for 8,000 years — your assets rest the same way, earning
          while they wait.
        </p>
      </div>

      <span className="label">Venues</span>
      {VENUES.map((v) => (
        <div key={v.name} className="card flex items-center gap-3 !py-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{v.name}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              {v.detail}
            </span>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: 'var(--gold)', color: '#14090E' }}
          >
            {t('soon')}
          </span>
        </div>
      ))}
      <p className="px-1 text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        Deposits open during Startup Village. The same engine that guards your sends will curate where your assets
        rest — clearly labeled risk, no fine print.
      </p>
    </div>
  );
}
