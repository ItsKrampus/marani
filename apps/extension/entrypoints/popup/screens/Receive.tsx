import React from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet } from '../lib/wallet';
import { CopyButton, Header, Logo } from '../lib/ui';

export default function Receive({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  const { t } = usePrefs();
  return (
    <div className="screen-in flex h-full flex-col">
      <Header title={t('receive')} onBack={onBack} />
      <div className="m-auto flex w-full flex-col items-center gap-4 px-6">
        <Logo size={44} />
        <div className="card w-full">
          <div className="label mb-1">{t('yourAddress')}</div>
          <div className="selectable break-all font-mono text-xs" style={{ color: 'var(--text)' }}>
            {wallet.address}
          </div>
        </div>
        <CopyButton text={wallet.address} />
        <p className="text-center text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Send SOL or any SPL / Token-2022 asset to this address on{' '}
          <span style={{ color: 'var(--text-2)' }}>Solana mainnet</span>.
        </p>
      </div>
    </div>
  );
}
