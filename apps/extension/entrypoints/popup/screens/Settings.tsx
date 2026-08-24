import { decryptVault, shortAddress } from '@marani/core';
import type { LabelSet, SupportMatrix } from '@marani/preflight';
import labelsJson from '@marani/preflight/data/labels.json';
import matrixJson from '@marani/preflight/data/support-matrix.json';
import React, { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { clearAll, getSettings, getVault, setSettings } from '../lib/storage';
import { useWallet } from '../lib/wallet';
import { Logo } from '../lib/ui';

const matrix = matrixJson as unknown as SupportMatrix;
const labels = labelsJson as unknown as LabelSet;

const ICONS = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18 M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01 M7 16.5h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2l8 3.5V11c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V5.5L12 2z" />
      <path d="M8.5 12l2.3 2.3 4.7-4.8" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.9 12.1L21 2 M15 8l3 3 M18 5l3 3" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  trash: <path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14 M10 11v6 M14 11v6" />,
} as const;

function RowIcon({ name, color = 'var(--gold)' }: { name: keyof typeof ICONS; color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICONS[name]}
    </svg>
  );
}

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--inactive)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'transform .18s ease', transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <div className="flex flex-col overflow-hidden rounded-[14px]" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  );
}

export default function Settings() {
  const wallet = useWallet();
  const prefs = usePrefs();
  const { t } = prefs;

  const [copied, setCopied] = useState(false);
  const [rpcOpen, setRpcOpen] = useState(false);
  const [rpcUrl, setRpcUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [revealPw, setRevealPw] = useState('');
  const [revealed, setRevealed] = useState('');
  const [revealError, setRevealError] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setRpcUrl(wallet.cluster === 'devnet' ? (s.rpcUrlDevnet ?? '') : s.rpcUrl));
  }, [wallet.cluster]);

  const rpcIsAuto = rpcUrl.trim() === '';
  const rpcValue = rpcIsAuto ? t('rpcAuto') : (() => {
    try {
      return new URL(rpcUrl).host;
    } catch {
      return rpcUrl.slice(0, 18);
    }
  })();

  const divider = { borderBottom: '1px solid var(--border-soft)' };

  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <span className="font-display text-[17px]">{t('settings')}</span>

      {/* profile */}
      <div
        className="flex items-center gap-3 rounded-[14px] p-3.5"
        style={{ background: 'linear-gradient(160deg, #2A0D1B, #1F161E)', border: '1px solid var(--border-accent)' }}
      >
        <span className="flex h-10 w-10 rounded-full" style={{ background: 'linear-gradient(135deg, #7A1533, #E0A458)' }} />
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{t('account')} 1</span>
          <span className="selectable font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
            {shortAddress(wallet.address, 4)}
          </span>
        </div>
        <button
          className="gold-chip rounded-full px-3 py-1.5 text-[11px] font-semibold cursor-pointer"
          style={{ color: 'var(--gold)', background: 'rgba(224,164,88,0.1)', border: '1px solid rgba(224,164,88,0.35)' }}
          onClick={async () => {
            await navigator.clipboard.writeText(wallet.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>

      {/* preferences */}
      <Section label={t('preferences')}>
        <div className="flex items-center gap-2.5 px-3.5 py-3" style={divider}>
          <RowIcon name="globe" />
          <span className="flex-1 text-[13px]">{t('language')}</span>
          <div className="flex rounded-full p-0.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            {(['en', 'ka'] as const).map((l) => (
              <button
                key={l}
                className="cursor-pointer rounded-full px-3 py-1 text-[11px] font-semibold"
                style={
                  prefs.lang === l
                    ? { background: 'var(--gold)', color: '#14090E' }
                    : { color: 'var(--text-3)', transition: 'color .15s ease' }
                }
                onClick={() => prefs.setLang(l)}
              >
                {l === 'en' ? 'EN' : 'ქა'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <RowIcon name="eye" />
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[13px]">{t('privacyMode')}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {t('privacyModeHint')}
            </span>
          </div>
          <button
            className="flex h-6 w-[42px] cursor-pointer items-center rounded-full p-0.5"
            style={{ background: prefs.privacy ? 'var(--gold)' : 'var(--border)', transition: 'background .2s ease' }}
            onClick={() => prefs.setPrivacy(!prefs.privacy)}
          >
            <span
              className="h-5 w-5 rounded-full"
              style={{ background: 'var(--text)', marginLeft: prefs.privacy ? 18 : 0, transition: 'margin .2s ease' }}
            />
          </button>
        </div>
      </Section>

      {/* network */}
      <Section label={t('network')}>
        <button className="tap-row flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-3 text-left" onClick={() => setRpcOpen((v) => !v)}>
          <RowIcon name="server" />
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[13px]">
              {t('rpcEndpoint')}
              {wallet.cluster === 'devnet' && (
                <span className="ml-1.5 rounded px-1 text-[9px] font-bold" style={{ background: 'rgba(224,164,88,0.12)', color: 'var(--gold)', border: '1px solid rgba(224,164,88,0.35)' }}>
                  DEVNET
                </span>
              )}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {rpcIsAuto ? t('rpcAutoHint') : rpcUrl.slice(0, 34)}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-2)' }}>
            <span className="flex h-[7px] w-[7px] rounded-full" style={{ background: wallet.loadError ? 'var(--red)' : 'var(--green)' }} />
            {rpcValue}
          </span>
          <Chevron open={rpcOpen} />
        </button>
        {rpcOpen && (
          <div className="flex flex-col gap-2 px-3.5 pb-3.5" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <input
              className="input font-mono text-xs"
              value={rpcUrl}
              placeholder="auto — picks a working public RPC"
              onChange={(e) => setRpcUrl(e.target.value)}
            />
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              Currently using: <span className="font-mono">{wallet.rpcUrl}</span>. Leave empty for auto. For the
              smoothest demo, paste a free helius.dev RPC URL.
            </p>
            <button
              className="btn btn-ghost self-start !py-1.5 text-xs"
              onClick={async () => {
                const s = await getSettings();
                await setSettings(wallet.cluster === 'devnet' ? { ...s, rpcUrlDevnet: rpcUrl } : { ...s, rpcUrl });
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              }}
            >
              {saved ? 'Saved ✓ (reopen popup)' : 'Save'}
            </button>
          </div>
        )}
      </Section>

      {/* guardian data */}
      <Section label={t('guardianData')}>
        <div className="flex flex-col gap-2.5 p-3.5" style={{ background: 'linear-gradient(160deg, #1F161E, #1a1019)' }}>
          <div className="flex items-center gap-2">
            <RowIcon name="shield" color="var(--green)" />
            <span className="flex-1 text-xs font-semibold">{t('guardianTitle')}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {t('updated')} {matrix.updatedAt.slice(0, 10)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              [matrix.entries.length.toLocaleString('en-US'), t('assetsTracked')],
              [String(Object.keys(matrix.exchanges).length), t('exchangesWord')],
              [String(labels.entries.length), t('cexLabels')],
            ].map(([num, label]) => (
              <div key={label} className="flex flex-col items-center gap-0.5 rounded-[10px] px-2 py-2" style={{ background: 'var(--bg)' }}>
                <span className="font-display text-base">{num}</span>
                <span className="text-center text-[9px]" style={{ color: 'var(--text-3)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* security */}
      <Section label={t('security')}>
        <button className="tap-row flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-3 text-left" style={seedOpen ? undefined : divider} onClick={() => setSeedOpen((v) => !v)}>
          <RowIcon name="key" />
          <span className="flex-1 text-[13px]">{t('revealSeed')}</span>
          <Chevron open={seedOpen} />
        </button>
        {seedOpen && (
          <div className="flex flex-col gap-2 px-3.5 pb-3.5" style={{ ...divider, paddingTop: 4 }}>
            {revealed ? (
              <div className="selectable rounded-lg p-2.5 text-xs leading-relaxed" style={{ background: 'var(--bg)' }}>
                {revealed}
              </div>
            ) : (
              <>
                <input
                  className="input"
                  type="password"
                  placeholder={t('password')}
                  value={revealPw}
                  onChange={(e) => setRevealPw(e.target.value)}
                />
                {revealError && (
                  <div className="text-xs" style={{ color: 'var(--red)' }}>
                    {revealError}
                  </div>
                )}
                <button
                  className="btn btn-ghost self-start !py-1.5 text-xs"
                  onClick={async () => {
                    try {
                      const vault = await getVault();
                      if (!vault) throw new Error('no vault');
                      setRevealed(await decryptVault(vault, revealPw));
                      setRevealError('');
                    } catch {
                      setRevealError(t('wrongPassword'));
                    }
                  }}
                >
                  Reveal
                </button>
              </>
            )}
          </div>
        )}
        <button className="tap-row flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-3 text-left" style={divider} onClick={wallet.lock}>
          <RowIcon name="lock" />
          <span className="flex-1 text-[13px]">{t('lockNow')}</span>
          <Chevron />
        </button>
        <button className="tap-row flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-3 text-left" onClick={() => setRemoveOpen((v) => !v)}>
          <RowIcon name="trash" color="var(--red)" />
          <span className="flex-1 text-[13px]" style={{ color: 'var(--red)' }}>
            {t('removeWallet')}
          </span>
          <Chevron open={removeOpen} />
        </button>
        {removeOpen && (
          <div className="flex flex-col gap-2 px-3.5 pb-3.5" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
              <input type="checkbox" checked={confirmReset} onChange={(e) => setConfirmReset(e.target.checked)} />
              I have my seed phrase backed up
            </label>
            <button
              className="btn btn-danger self-start !py-1.5 text-xs"
              disabled={!confirmReset}
              onClick={async () => {
                await clearAll();
                window.close();
              }}
            >
              {t('removeWallet')}
            </button>
          </div>
        )}
      </Section>

      {/* footer */}
      <div className="flex items-center justify-center gap-1.5 pb-1">
        <Logo size={9} />
        <span className="text-[10px]" style={{ color: 'var(--inactive)' }}>
          {t('footerLine')}
        </span>
      </div>
    </div>
  );
}
