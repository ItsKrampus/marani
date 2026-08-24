import { getRecentActivity, shortAddress, type ActivityItem } from '@marani/core';
import React, { useEffect, useState } from 'react';
import { useWallet } from '../lib/wallet';
import { Header, Spinner } from '../lib/ui';

export default function Activity({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getRecentActivity(wallet.rpc, wallet.address)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [wallet.rpc, wallet.address]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Activity" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
        {!items && !error && <Spinner label="Loading history…" />}
        {error && <div className="text-xs text-red-400">{error}</div>}
        {items?.length === 0 && <div className="text-xs text-zinc-500">No transactions yet.</div>}
        {items?.map((it) => (
          <a
            key={it.signature}
            className="card !py-3 hover:bg-white/[0.07]"
            href={`https://solscan.io/tx/${it.signature}`}
            target="_blank"
            rel="noreferrer"
          >
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs">{shortAddress(it.signature, 8)}</div>
              <div className={`text-[10px] font-bold ${it.err ? 'text-red-400' : 'text-emerald-400'}`}>
                {it.err ? 'FAILED' : 'OK'}
              </div>
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              {it.blockTime ? new Date(it.blockTime * 1000).toLocaleString() : `slot ${it.slot}`}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
