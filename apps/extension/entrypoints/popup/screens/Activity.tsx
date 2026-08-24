import { getRecentActivity, shortAddress, type ActivityItem } from '@marani/core';
import React, { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet } from '../lib/wallet';
import { Spinner } from '../lib/ui';

export default function Activity() {
  const wallet = useWallet();
  const { t } = usePrefs();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getRecentActivity(wallet.rpc, wallet.address)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [wallet.rpc, wallet.address]);

  return (
    <div className="flex flex-col gap-2 pt-1">
      <span className="label pb-1">{t('activity')}</span>
      {!items && !error && <Spinner label="Loading history…" />}
      {error && (
        <div className="text-xs" style={{ color: 'var(--red)' }}>
          {error}
        </div>
      )}
      {items?.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          {t('noTransactions')}
        </div>
      )}
      {items?.map((it) => (
        <a
          key={it.signature}
          className="card !py-3"
          href={`https://solscan.io/tx/${it.signature}`}
          target="_blank"
          rel="noreferrer"
        >
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs">{shortAddress(it.signature, 8)}</div>
            <div className="text-[10px] font-bold" style={{ color: it.err ? 'var(--red)' : 'var(--green)' }}>
              {it.err ? 'FAILED' : 'OK'}
            </div>
          </div>
          <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
            {it.blockTime ? new Date(it.blockTime * 1000).toLocaleString() : `slot ${it.slot}`}
          </div>
        </a>
      ))}
    </div>
  );
}
