import { decryptVault } from '@marani/core';
import React, { useState } from 'react';
import { Brand } from '../App';
import { getVault, setSessionMnemonic } from '../lib/storage';

export default function Unlock({ onUnlocked }: { onUnlocked: (mnemonic: string) => Promise<void> }) {
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
      setError('Wrong password.');
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-5">
      <Brand />
      <div className="m-auto w-full flex flex-col gap-3">
        <div className="text-center text-sm text-zinc-400">Unlock your wallet</div>
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && unlock()}
        />
        {error && <div className="text-xs text-red-400 text-center">{error}</div>}
        <button className="btn btn-primary" disabled={busy || pw.length === 0} onClick={unlock}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
