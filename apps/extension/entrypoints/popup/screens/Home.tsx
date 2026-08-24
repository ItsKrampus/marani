import { formatRawAmount } from '@marani/core';
import React, { useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet, type TokenRow } from '../lib/wallet';
import { BottomNav, fmtUsd, Logo, pctText, Spinner, TokenIcon, TopBar, type Tab } from '../lib/ui';
import Send from './Send';
import Receive from './Receive';
import Swap from './Swap';
import Activity from './Activity';
import Settings from './Settings';
import Cellar from './Cellar';

type Route = Tab | 'send' | 'receive' | 'swap';

const ACTION_ICONS = {
  send: 'M12 19V5 M5 12l7-7 7 7',
  receive: 'M12 5v14 M19 12l-7 7-7-7',
  swap: 'M7 16V4 M3 8l4-4 4 4 M17 8v12 M13 16l4 4 4-4',
  buy: 'M12 5v14 M5 12h14',
} as const;

export default function Home() {
  const wallet = useWallet();
  const { t, privacy, mask } = usePrefs();
  const [route, setRoute] = useState<Route>('home');
  const [presetToken, setPresetToken] = useState<TokenRow | null>(null);

  if (route === 'send')
    return (
      <Send
        onBack={() => {
          setRoute('home');
          wallet.refresh();
        }}
        preset={presetToken}
      />
    );
  if (route === 'receive') return <Receive onBack={() => setRoute('home')} />;
  if (route === 'swap')
    return (
      <Swap
        onBack={() => {
          setRoute('home');
          wallet.refresh();
        }}
      />
    );

  const tab = route as Tab;
  const change = pctText(
    wallet.totalUsd && wallet.totalChangeUsd !== null && wallet.totalUsd !== wallet.totalChangeUsd
      ? (wallet.totalChangeUsd / (wallet.totalUsd - wallet.totalChangeUsd)) * 100
      : null,
  );

  const actions: Array<{ key: keyof typeof ACTION_ICONS; onClick?: () => void; soon?: boolean }> = [
    { key: 'send', onClick: () => { setPresetToken(null); setRoute('send'); } },
    { key: 'receive', onClick: () => setRoute('receive') },
    { key: 'swap', onClick: () => setRoute('swap') },
    { key: 'buy', soon: true },
  ];

  const homeBody = (
    <>
      {/* balance */}
      <div className="flex flex-col items-center gap-1 pb-1 pt-2">
        <span className="label">{t('totalBalance')}</span>
        <span className="font-display text-[36px] leading-[1.1]">
          {privacy ? '••••••' : wallet.totalUsd !== null ? fmtUsd(wallet.totalUsd) : '—'}
        </span>
        {!privacy && wallet.totalChangeUsd !== null && wallet.totalUsd !== null && (
          <span className="text-xs" style={{ color: change.color }}>
            {wallet.totalChangeUsd >= 0 ? '+' : '−'}
            {fmtUsd(Math.abs(wallet.totalChangeUsd))} {change.text && `(${change.text})`} {t('today')}
          </span>
        )}
      </div>

      {/* actions */}
      <div className="grid grid-cols-4 gap-2 pb-4 pt-4">
        {actions.map((a) => (
          <button
            key={a.key}
            className="flex flex-col items-center gap-1.5 cursor-pointer disabled:cursor-default"
            onClick={a.onClick}
            disabled={a.soon}
          >
            <span
              className="relative flex h-11 w-11 items-center justify-center rounded-[14px]"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', opacity: a.soon ? 0.55 : 1 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={ACTION_ICONS[a.key]} />
              </svg>
              {a.soon && (
                <span
                  className="absolute -right-1 -top-1 rounded-full px-1 text-[8px] font-bold"
                  style={{ background: 'var(--gold)', color: '#14090E' }}
                >
                  {t('soon')}
                </span>
              )}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
              {t(a.key)}
            </span>
          </button>
        ))}
      </div>

      {/* cellar banner */}
      <button
        className="mb-4 flex items-center gap-3 rounded-[14px] p-3 text-left cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #2A0D1B, #1F161E)', border: '1px solid var(--border-accent)' }}
        onClick={() => setRoute('cellar')}
      >
        <Logo size={24} />
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-display text-sm">{t('cellarTitle')}</span>
          <span className="text-[11px] leading-snug" style={{ color: 'var(--text-2)' }}>
            {t('cellarBody')}
          </span>
        </div>
        <span
          className="whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold"
          style={{ background: 'var(--gold)', color: '#14090E' }}
        >
          {t('cellarCta')}
        </span>
      </button>

      {/* assets */}
      <div className="flex items-center justify-between pb-2.5">
        <span className="label">{t('assets')}</span>
        <button className="text-[11px] cursor-pointer" style={{ color: 'var(--gold)' }} onClick={wallet.refresh}>
          {t('refresh')}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {wallet.loading && <Spinner label="Reading balances…" />}
        {wallet.loadError && (
          <div className="card !py-3 text-xs" style={{ color: 'var(--red)' }}>
            RPC error: {wallet.loadError}
          </div>
        )}
        {!wallet.loading &&
          wallet.rows.map((row) => {
            const pc = pctText(row.change24hPct);
            return (
              <button
                key={row.mint ?? 'SOL'}
                className="flex items-center gap-2.5 rounded-xl p-2.5 text-left cursor-pointer"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                onClick={() => {
                  setPresetToken(row);
                  setRoute('send');
                }}
              >
                <TokenIcon symbol={row.symbol} logoUri={row.logoUri} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    {row.name}
                    {row.program === 'token-2022' && (
                      <span className="rounded px-1 text-[8px] font-bold" style={{ background: '#2A0D1B', color: 'var(--gold)', border: '1px solid var(--border-accent)' }}>
                        T22
                      </span>
                    )}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {mask(`${formatRawAmount(row.amountRaw, row.decimals, 5)} ${row.symbol}`)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[13px] font-semibold">
                    {mask(row.usdValue !== null ? fmtUsd(row.usdValue) : '—')}
                  </span>
                  {pc.text && (
                    <span className="text-[11px]" style={{ color: pc.color }}>
                      {pc.text}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        {!wallet.loading && !wallet.loadError && wallet.rows.length === 1 && wallet.rows[0]!.amountRaw === 0n && (
          <div className="card text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            This wallet is empty. Open <span style={{ color: 'var(--text)' }}>{t('receive')}</span> to get your address
            and fund it with a little SOL.
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar address={wallet.address} onAvatar={() => setRoute('settings')} />
      <div className="flex-1 overflow-y-auto px-4 pb-3 pt-2">
        {tab === 'home' && homeBody}
        {tab === 'cellar' && <Cellar />}
        {tab === 'activity' && <Activity />}
        {tab === 'settings' && <Settings />}
      </div>
      <BottomNav active={tab} onSelect={(next) => setRoute(next)} />
    </div>
  );
}
