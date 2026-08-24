import { explorerUrl, formatRawAmount, requestDevnetAirdrop, shortAddress } from '@marani/core';
import React, { useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet } from '../lib/wallet';
import { CopyButton, ErrorNote, Header, Logo, Spinner } from '../lib/ui';

export default function Receive({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  const { t } = usePrefs();
  const [dropState, setDropState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [dropSig, setDropSig] = useState('');
  const [dropError, setDropError] = useState('');

  const airdrop = async () => {
    setDropState('busy');
    setDropError('');
    try {
      const res = await requestDevnetAirdrop(wallet.rpc, wallet.address, 1_000_000_000n);
      if (!res.confirmed) throw new Error('Airdrop not confirmed — the faucet may be congested, try again');
      setDropSig(res.signature);
      setDropState('done');
      wallet.refresh();
    } catch (e) {
      setDropError((e as Error).message);
      setDropState('error');
    }
  };

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
          <span style={{ color: 'var(--text-2)' }}>
            Solana {wallet.cluster === 'devnet' ? 'devnet' : 'mainnet'}
          </span>
          .
        </p>

        {wallet.cluster === 'devnet' && (
          <div className="flex w-full flex-col gap-2">
            {dropState === 'idle' && (
              <button className="btn btn-primary" onClick={airdrop}>
                Request 1 SOL airdrop
              </button>
            )}
            {dropState === 'busy' && <Spinner label="Requesting from the devnet faucet…" />}
            {dropState === 'done' && (
              <a
                className="card !py-2 text-center text-xs"
                style={{ color: 'var(--green)' }}
                href={explorerUrl('tx', dropSig, 'devnet')}
                target="_blank"
                rel="noreferrer"
              >
                ✓ Airdropped {formatRawAmount(1_000_000_000n, 9)} SOL — {shortAddress(dropSig, 6)} ↗
              </a>
            )}
            {dropState === 'error' && (
              <>
                <ErrorNote text={dropError} />
                <button className="btn btn-ghost" onClick={() => setDropState('idle')}>
                  {t('tryAgain')}
                </button>
              </>
            )}
            <p className="text-center text-[10px]" style={{ color: 'var(--inactive)' }}>
              Devnet SOL has no value — for testing only. The public faucet rate-limits per address and IP.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
