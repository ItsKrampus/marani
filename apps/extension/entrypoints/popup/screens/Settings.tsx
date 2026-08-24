import { decryptVault } from '@marani/core';
import type { SupportMatrix } from '@marani/preflight';
import matrixJson from '@marani/preflight/data/support-matrix.json';
import React, { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { clearAll, getSettings, getVault, setSettings } from '../lib/storage';
import { useWallet } from '../lib/wallet';

const matrix = matrixJson as unknown as SupportMatrix;

export default function Settings() {
  const wallet = useWallet();
  const prefs = usePrefs();
  const [rpcUrl, setRpcUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [revealPw, setRevealPw] = useState('');
  const [revealed, setRevealed] = useState('');
  const [revealError, setRevealError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setRpcUrl(s.rpcUrl));
  }, []);

  const exchangeSummary = Object.values(matrix.exchanges)
    .map((e) => `${e.name} (${e.assets})`)
    .join(', ');

  return (
    <div className="flex flex-col gap-3 pt-1">
      <span className="label pb-1">{prefs.t('settings')}</span>

      <div className="card !py-3">
        <div className="label mb-2">{prefs.t('language')}</div>
        <div className="grid grid-cols-2 gap-2">
          {(['en', 'ka'] as const).map((l) => (
            <button
              key={l}
              className="btn !py-2 text-xs"
              style={
                prefs.lang === l
                  ? { background: 'var(--gold)', color: '#14090E' }
                  : { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }
              }
              onClick={() => prefs.setLang(l)}
            >
              {l === 'en' ? 'English' : 'ქართული'}
            </button>
          ))}
        </div>
      </div>

      <div className="card flex items-center justify-between !py-3">
        <div>
          <div className="text-[13px] font-semibold">{prefs.t('privacyMode')}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {prefs.t('privacyModeHint')}
          </div>
        </div>
        <button
          className="relative h-6 w-11 rounded-full transition-colors cursor-pointer"
          style={{ background: prefs.privacy ? 'var(--gold)' : 'var(--border)' }}
          onClick={() => prefs.setPrivacy(!prefs.privacy)}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
            style={{ left: prefs.privacy ? 22 : 2 }}
          />
        </button>
      </div>

      <div className="card">
        <div className="label mb-1">RPC endpoint</div>
        <input
          className="input font-mono text-xs"
          value={rpcUrl}
          placeholder="auto — picks a working public RPC"
          onChange={(e) => setRpcUrl(e.target.value)}
        />
        <p className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
          Leave empty for auto. Currently using: <span className="font-mono">{wallet.rpcUrl}</span>. For the smoothest
          demo, paste a free helius.dev RPC URL.
        </p>
        <button
          className="btn btn-ghost mt-2 text-xs"
          onClick={async () => {
            const s = await getSettings();
            await setSettings({ ...s, rpcUrl });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          {saved ? 'Saved ✓ (reopen popup)' : 'Save'}
        </button>
      </div>

      <div className="card">
        <div className="label mb-1">Safety data</div>
        <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
          Exchange support matrix: <span style={{ color: 'var(--text)' }}>{matrix.entries.length} entries</span>,
          updated {matrix.updatedAt.slice(0, 10)}.
          <br />
          {exchangeSummary}
        </div>
      </div>

      <div className="card">
        <div className="label mb-1">Reveal seed phrase</div>
        {revealed ? (
          <div className="selectable rounded-lg p-2 text-xs leading-relaxed" style={{ background: 'var(--bg-input)' }}>
            {revealed}
          </div>
        ) : (
          <>
            <input
              className="input"
              type="password"
              placeholder={prefs.t('password')}
              value={revealPw}
              onChange={(e) => setRevealPw(e.target.value)}
            />
            {revealError && (
              <div className="mt-1 text-xs" style={{ color: 'var(--red)' }}>
                {revealError}
              </div>
            )}
            <button
              className="btn btn-ghost mt-2 text-xs"
              onClick={async () => {
                try {
                  const vault = await getVault();
                  if (!vault) throw new Error('no vault');
                  setRevealed(await decryptVault(vault, revealPw));
                  setRevealError('');
                } catch {
                  setRevealError(prefs.t('wrongPassword'));
                }
              }}
            >
              Reveal
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ borderColor: 'var(--wine)' }}>
        <div className="label mb-1" style={{ color: 'var(--red)' }}>
          Danger zone
        </div>
        <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <input type="checkbox" checked={confirmReset} onChange={(e) => setConfirmReset(e.target.checked)} />
          I have my seed phrase backed up
        </label>
        <button
          className="btn btn-danger mt-2 text-xs"
          disabled={!confirmReset}
          onClick={async () => {
            await clearAll();
            window.close();
          }}
        >
          Remove wallet from this device
        </button>
      </div>

      <button className="btn btn-ghost" onClick={wallet.lock}>
        {prefs.t('lockWallet')}
      </button>
      <div className="pb-1 text-center text-[10px]" style={{ color: 'var(--inactive)' }}>
        Marani v0.1.0 — built at Startup Village, Kakheti 🍇
      </div>
    </div>
  );
}
