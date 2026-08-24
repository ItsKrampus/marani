import {
  formatAmountCompact,
  formatRawAmount,
  getParsedActivity,
  shortAddress,
  WELL_KNOWN_TOKENS,
  type ParsedActivity,
} from '@marani/core';
import React, { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { getActivityCache, getMetaCache, putActivityCache, type CachedTokenMeta } from '../lib/storage';
import { useWallet } from '../lib/wallet';
import { Spinner, TokenIcon } from '../lib/ui';

const KIND_LABEL: Record<ParsedActivity['kind'], string> = {
  sent: 'Sent',
  received: 'Received',
  swap: 'Swapped',
  app: 'App interaction',
};

export default function Activity() {
  const wallet = useWallet();
  const { t, mask } = usePrefs();
  const [items, setItems] = useState<ParsedActivity[] | null>(null);
  const [metaCache, setMetaCache] = useState<Record<string, CachedTokenMeta>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [known, meta] = await Promise.all([getActivityCache(wallet.address), getMetaCache()]);
        if (!cancelled) setMetaCache(meta);
        const { items: parsed, parsedNew } = await getParsedActivity(wallet.rpc, wallet.address, {
          known: known as Record<string, ParsedActivity>,
        });
        if (parsedNew.length) await putActivityCache(wallet.address, parsedNew);
        if (!cancelled) setItems(parsed);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet.rpc, wallet.address]);

  const symbolFor = (mint: string | null): string => {
    if (mint === null) return 'SOL';
    return (
      WELL_KNOWN_TOKENS[mint]?.symbol ??
      wallet.rows.find((r) => r.mint === mint)?.symbol ??
      metaCache[mint]?.symbol ??
      shortAddress(mint)
    );
  };
  const logoFor = (mint: string | null): string | null => {
    const key = mint ?? null;
    return wallet.rows.find((r) => r.mint === key)?.logoUri ?? (mint ? (metaCache[mint]?.logoUri ?? null) : null);
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <span className="label pb-1">{t('activity')}</span>
      {!items && !error && <Spinner label="Reading transactions…" />}
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
      {items?.map((it) => {
        const outs = it.deltas.filter((d) => BigInt(d.delta) < 0n);
        const ins = it.deltas.filter((d) => BigInt(d.delta) > 0n);
        const primary = it.kind === 'received' ? ins[0] : (outs[0] ?? ins[0]);
        const title =
          it.kind === 'swap' && outs[0] && ins[0]
            ? `${symbolFor(outs[0].mint)} → ${symbolFor(ins[0].mint)}`
            : primary
              ? `${KIND_LABEL[it.kind]} ${symbolFor(primary.mint)}`
              : KIND_LABEL[it.kind];
        return (
          <a
            key={it.signature}
            className="card flex items-center gap-2.5 !py-3"
            href={`https://solscan.io/tx/${it.signature}`}
            target="_blank"
            rel="noreferrer"
          >
            <div className="relative">
              <TokenIcon symbol={primary ? symbolFor(primary.mint) : '·'} logoUri={primary ? logoFor(primary.mint) : null} size={30} />
              <span
                className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: 'var(--bg)', color: it.kind === 'received' ? 'var(--green)' : it.kind === 'swap' ? 'var(--gold)' : 'var(--text-2)' }}
              >
                {it.kind === 'received' ? '↓' : it.kind === 'sent' ? '↑' : it.kind === 'swap' ? '⇄' : '•'}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold">
                {title}
                {it.failed && (
                  <span className="ml-1.5 rounded px-1 text-[9px] font-bold" style={{ background: '#2A0D1B', color: 'var(--red)', border: '1px solid #7A1533' }}>
                    FAILED
                  </span>
                )}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                {it.blockTime ? new Date(it.blockTime * 1000).toLocaleString() : shortAddress(it.signature, 8)}
              </span>
            </div>
            <div className="flex max-w-[130px] flex-col items-end gap-0.5">
              {ins[0] && (
                <span
                  className="truncate text-[12px] font-semibold"
                  style={{ color: 'var(--green)' }}
                  title={`+${formatRawAmount(BigInt(ins[0].delta), ins[0].decimals)} ${symbolFor(ins[0].mint)}`}
                >
                  {mask(`+${formatAmountCompact(BigInt(ins[0].delta), ins[0].decimals)} ${symbolFor(ins[0].mint)}`)}
                </span>
              )}
              {outs[0] && (
                <span
                  className="truncate text-[12px] font-semibold"
                  style={{ color: ins[0] ? 'var(--text-2)' : 'var(--text)' }}
                  title={`−${formatRawAmount(-BigInt(outs[0].delta), outs[0].decimals)} ${symbolFor(outs[0].mint)}`}
                >
                  {mask(`−${formatAmountCompact(-BigInt(outs[0].delta), outs[0].decimals)} ${symbolFor(outs[0].mint)}`)}
                </span>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
