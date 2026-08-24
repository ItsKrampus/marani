import { decryptVault } from '@marani/core';
import type { SupportMatrix } from '@marani/preflight';
import matrixJson from '@marani/preflight/data/support-matrix.json';
import React, { useEffect, useState } from 'react';
import { clearAll, getSettings, getVault, setSettings } from '../lib/storage';
import { useWallet } from '../lib/wallet';
import { Header } from '../lib/ui';

const matrix = matrixJson as unknown as SupportMatrix;

export default function Settings({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  const [rpcUrl, setRpcUrl] = useState(wallet.rpcUrl);
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
    <div className="flex h-full flex-col">
      <Header title="Settings" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
        <div className="card">
          <div className="label mb-1">RPC endpoint</div>
          <input
            className="input font-mono text-xs"
            value={rpcUrl}
            placeholder="auto — picks a working public RPC"
            onChange={(e) => setRpcUrl(e.target.value)}
          />
          <p className="mt-1 text-[10px] text-zinc-500">
            Leave empty for auto. Currently using: <span className="font-mono">{wallet.rpcUrl}</span>. For the smoothest
            demo, paste a free helius.dev RPC URL.
          </p>
          <button
            className="btn btn-ghost mt-2 text-xs"
            onClick={async () => {
              await setSettings({ rpcUrl });
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }}
          >
            {saved ? 'Saved ✓ (reopen popup)' : 'Save'}
          </button>
        </div>

        <div className="card">
          <div className="label mb-1">Safety data</div>
          <div className="text-[11px] text-zinc-400 leading-relaxed">
            Exchange support matrix: <span className="text-zinc-200">{matrix.entries.length} entries</span>, updated{' '}
            {matrix.updatedAt.slice(0, 10)}.
            <br />
            {exchangeSummary}
          </div>
        </div>

        <div className="card">
          <div className="label mb-1">Reveal seed phrase</div>
          {revealed ? (
            <div className="rounded-lg bg-black/40 p-2 text-xs leading-relaxed">{revealed}</div>
          ) : (
            <>
              <input
                className="input"
                type="password"
                placeholder="Enter password"
                value={revealPw}
                onChange={(e) => setRevealPw(e.target.value)}
              />
              {revealError && <div className="mt-1 text-xs text-red-400">{revealError}</div>}
              <button
                className="btn btn-ghost mt-2 text-xs"
                onClick={async () => {
                  try {
                    const vault = await getVault();
                    if (!vault) throw new Error('no vault');
                    setRevealed(await decryptVault(vault, revealPw));
                    setRevealError('');
                  } catch {
                    setRevealError('Wrong password.');
                  }
                }}
              >
                Reveal
              </button>
            </>
          )}
        </div>

        <div className="card !border-red-900/50">
          <div className="label mb-1 !text-red-400">Danger zone</div>
          <label className="flex items-center gap-2 text-[11px] text-zinc-500">
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
          Lock wallet
        </button>
        <div className="text-center text-[10px] text-zinc-600">Marani v0.1.0 — built at Startup Village, Kakheti 🍇</div>
      </div>
    </div>
  );
}
