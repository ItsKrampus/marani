import React from 'react';
import { useWallet } from '../lib/wallet';
import { CopyButton, Header, Logo } from '../lib/ui';

export default function Receive({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  return (
    <div className="flex h-full flex-col">
      <Header title="Receive" onBack={onBack} />
      <div className="m-auto flex w-full flex-col items-center gap-4 px-6">
        <Logo size={48} />
        <div className="card w-full">
          <div className="label mb-1">Your Solana address</div>
          <div className="break-all font-mono text-xs text-zinc-200">{wallet.address}</div>
        </div>
        <CopyButton text={wallet.address} />
        <p className="text-center text-[11px] text-zinc-500 leading-relaxed">
          Send SOL or any SPL / Token-2022 asset to this address on{' '}
          <span className="text-zinc-300">Solana mainnet</span>.
        </p>
      </div>
    </div>
  );
}
