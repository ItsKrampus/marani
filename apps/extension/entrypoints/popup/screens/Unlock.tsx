import { decryptVault } from '@marani/core';
import React, { useState } from 'react';
import { Brand } from '../App';
import { usePrefs } from '../lib/prefs';
import { getVault, setSessionMnemonic } from '../lib/storage';

export default function Unlock({ onUnlocked }: { onUnlocked: (mnemonic: string) => Promise<void> }) {
  const { t } = usePrefs();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unlock = async () => {
    setBusy(true);
    setError('');
    try {
      const vault = await getVault();
      if (!vault) throw new Error('No wallet found');
      const mnemonic = await decryptVault(vault, pw);
      await setSessionMnemonic(mnemonic);
      await onUnlocked(mnemonic);
    } catch {
      setError(t('wrongPassword'));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-5">
      <Brand />
      <div className="m-auto flex w-full flex-col gap-3">
        <div className="text-center font-display text-lg">{t('unlockTitle')}</div>
        <input
          className="input"
          type="password"
          placeholder={t('password')}
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && unlock()}
        />
        {error && (
          <div className="text-center text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary" disabled={busy || pw.length === 0} onClick={unlock}>
          {busy ? t('unlocking') : t('unlock')}
        </button>
      </div>
    </div>
  );
}
