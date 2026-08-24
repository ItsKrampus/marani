import { pickRpcUrl, signerFromMnemonic, type Cluster, type KeyPairSigner } from '@marani/core';
import React, { useEffect, useState } from 'react';
import { WalletProvider } from './lib/wallet';
import { PrefsProvider } from './lib/prefs';
import {
  getRpcPick,
  getSessionMnemonic,
  getSettings,
  getVault,
  clearSessionMnemonic,
  setRpcPick,
  setSettings as setSettingsPatch,
} from './lib/storage';
import { Logo, WaitState } from './lib/ui';
import Onboard from './screens/Onboard';
import Unlock from './screens/Unlock';
import Home from './screens/Home';

type Phase =
  | { t: 'boot' }
  | { t: 'onboard' }
  | { t: 'locked' }
  | { t: 'ready'; signer: KeyPairSigner; mnemonic: string; rpcUrl: string; rpcIsAuto: boolean; cluster: Cluster };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ t: 'boot' });

  const unlockWith = async (mnemonic: string, clusterOverride?: Cluster) => {
    const [signer, settings] = await Promise.all([signerFromMnemonic(mnemonic), getSettings()]);
    const cluster: Cluster = clusterOverride ?? settings.cluster ?? 'mainnet';
    let rpcUrl = (cluster === 'devnet' ? (settings.rpcUrlDevnet ?? '') : settings.rpcUrl).trim();
    const rpcIsAuto = rpcUrl === '';
    if (rpcIsAuto) {
      // auto mode: probe once, then reuse the pick for 10 minutes across popup opens
      const cached = await getRpcPick(cluster);
      if (cached && Date.now() - cached.at < 10 * 60_000) {
        rpcUrl = cached.url;
      } else {
        rpcUrl = await pickRpcUrl(undefined, cluster);
        await setRpcPick(rpcUrl, cluster);
      }
    }
    setPhase({ t: 'ready', signer, mnemonic, rpcUrl, rpcIsAuto, cluster });
  };

  const switchCluster = async (cluster: Cluster) => {
    if (phase.t !== 'ready' || phase.cluster === cluster) return;
    const settings = await getSettings();
    await setSettingsPatch({ ...settings, cluster });
    setPhase({ t: 'boot' });
    await unlockWith(phase.mnemonic, cluster);
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

  let body: React.ReactNode;
  if (phase.t === 'boot') {
    body = (
      <div className="flex h-full items-center justify-center">
        <WaitState title="Marani" sub="Opening the cellar…" pad={false} />
      </div>
    );
  } else if (phase.t === 'onboard') {
    body = <Onboard onDone={unlockWith} />;
  } else if (phase.t === 'locked') {
    body = <Unlock onUnlocked={unlockWith} />;
  } else {
    body = (
      <WalletProvider
        signer={phase.signer}
        mnemonic={phase.mnemonic}
        rpcUrl={phase.rpcUrl}
        rpcIsAuto={phase.rpcIsAuto}
        cluster={phase.cluster}
        onSwitchCluster={switchCluster}
        onLock={async () => {
          await clearSessionMnemonic();
          setPhase({ t: 'locked' });
        }}
      >
        <Home />
      </WalletProvider>
    );
  }

  return <PrefsProvider>{body}</PrefsProvider>;
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={26} />
      <div>
        <div className="font-display text-base tracking-[0.08em]">MARANI</div>
        <div className="-mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
          the wallet that won't let you lose money
        </div>
      </div>
    </div>
  );
}
