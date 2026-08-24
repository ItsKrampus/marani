import { pickRpcUrl, signerFromMnemonic, type KeyPairSigner } from '@marani/core';
import React, { useEffect, useState } from 'react';
import { WalletProvider } from './lib/wallet';
import { getSessionMnemonic, getSettings, getVault, clearSessionMnemonic } from './lib/storage';
import { Spinner, Logo } from './lib/ui';
import Onboard from './screens/Onboard';
import Unlock from './screens/Unlock';
import Home from './screens/Home';

type Phase =
  | { t: 'boot' }
  | { t: 'onboard' }
  | { t: 'locked' }
  | { t: 'ready'; signer: KeyPairSigner; mnemonic: string; rpcUrl: string };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ t: 'boot' });

  const unlockWith = async (mnemonic: string) => {
    const [signer, settings] = await Promise.all([signerFromMnemonic(mnemonic), getSettings()]);
    const rpcUrl = await pickRpcUrl(settings.rpcUrl || undefined);
    setPhase({ t: 'ready', signer, mnemonic, rpcUrl });
  };

  useEffect(() => {
    (async () => {
      const vault = await getVault();
      if (!vault) {
        setPhase({ t: 'onboard' });
        return;
      }
      const sessionMnemonic = await getSessionMnemonic();
      if (sessionMnemonic) {
        await unlockWith(sessionMnemonic);
      } else {
        setPhase({ t: 'locked' });
      }
    })();
  }, []);

  if (phase.t === 'boot') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Opening the cellar…" />
      </div>
    );
  }
  if (phase.t === 'onboard') return <Onboard onDone={unlockWith} />;
  if (phase.t === 'locked') return <Unlock onUnlocked={unlockWith} />;

  return (
    <WalletProvider
      signer={phase.signer}
      mnemonic={phase.mnemonic}
      rpcUrl={phase.rpcUrl}
      onLock={async () => {
        await clearSessionMnemonic();
        setPhase({ t: 'locked' });
      }}
    >
      <Home />
    </WalletProvider>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <Logo />
      <div>
        <div className="text-sm font-black tracking-wide">MARANI</div>
        <div className="text-[10px] text-zinc-500 -mt-0.5">the wallet that won't let you lose money</div>
      </div>
    </div>
  );
}
