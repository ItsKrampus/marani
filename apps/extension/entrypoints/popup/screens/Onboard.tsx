import { encryptVault, isValidMnemonic, newMnemonic, normalizeMnemonic } from '@marani/core';
import React, { useState } from 'react';
import { Brand } from '../App';
import { setSessionMnemonic, setVault } from '../lib/storage';
import { CopyButton, WaitState } from '../lib/ui';

type Step =
  | { t: 'welcome' }
  | { t: 'show-seed'; mnemonic: string }
  | { t: 'import' }
  | { t: 'password'; mnemonic: string }
  | { t: 'working' };

export default function Onboard({ onDone }: { onDone: (mnemonic: string) => Promise<void> }) {
  const [step, setStep] = useState<Step>({ t: 'welcome' });
  const [importText, setImportText] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');

  const finish = async (mnemonic: string) => {
    if (pw.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (pw !== pw2) {
      setError('Passwords do not match.');
      return;
    }
    setStep({ t: 'working' });
    const vault = await encryptVault(mnemonic, pw);
    await setVault(vault);
    await setSessionMnemonic(mnemonic);
    await onDone(mnemonic);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <Brand />
      {step.t === 'welcome' && (
        <>
          <div className="card mt-4">
            <div className="text-lg font-bold">Welcome to Marani</div>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              A Solana wallet with a guardian in the send flow: it checks whether the exchange you're sending to
              actually supports the token — <span className="text-zinc-200">before</span> your money leaves.
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <button className="btn btn-primary" onClick={() => setStep({ t: 'show-seed', mnemonic: newMnemonic() })}>
              Create a new wallet
            </button>
            <button className="btn btn-ghost" onClick={() => setStep({ t: 'import' })}>
              Import an existing seed phrase
            </button>
          </div>
        </>
      )}

      {step.t === 'show-seed' && (
        <>
          <div className="text-sm text-zinc-300 font-semibold">Your recovery phrase</div>
          <div className="card grid grid-cols-3 gap-2">
            {step.mnemonic.split(' ').map((w, i) => (
              <div key={i} className="rounded-lg bg-black/40 px-2 py-1.5 text-xs">
                <span className="text-zinc-500 mr-1">{i + 1}.</span>
                {w}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-300/90 max-w-[220px]">
              Write these 12 words down. Anyone with them controls your funds.
            </p>
            <CopyButton text={step.mnemonic} small />
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <button className="btn btn-primary" onClick={() => setStep({ t: 'password', mnemonic: step.mnemonic })}>
              I saved it — continue
            </button>
            <button className="btn btn-ghost" onClick={() => setStep({ t: 'welcome' })}>
              Back
            </button>
          </div>
        </>
      )}

      {step.t === 'import' && (
        <>
          <div className="text-sm text-zinc-300 font-semibold">Import seed phrase</div>
          <textarea
            className="input h-24 resize-none"
            placeholder="Enter your 12 or 24 words separated by spaces"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="mt-auto flex flex-col gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                const m = normalizeMnemonic(importText);
                if (!isValidMnemonic(m)) {
                  setError('That is not a valid BIP-39 seed phrase.');
                  return;
                }
                setError('');
                setStep({ t: 'password', mnemonic: m });
              }}
            >
              Continue
            </button>
            <button className="btn btn-ghost" onClick={() => setStep({ t: 'welcome' })}>
              Back
            </button>
          </div>
        </>
      )}

      {step.t === 'password' && (
        <>
          <div className="text-sm text-zinc-300 font-semibold">Set an unlock password</div>
          <p className="text-xs text-zinc-500">Encrypts your seed on this device (AES-256-GCM).</p>
          <input
            className="input"
            type="password"
            placeholder="Password (min 8 chars)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Repeat password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="mt-auto flex flex-col gap-2">
            <button className="btn btn-primary" onClick={() => finish(step.mnemonic)}>
              Create wallet
            </button>
          </div>
        </>
      )}

      {step.t === 'working' && (
        <div className="m-auto">
          <WaitState title="Sealing the qvevri…" sub="Encrypting your vault on this device" pad={false} />
        </div>
      )}
    </div>
  );
}
