import React from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet } from '../lib/wallet';
import { CopyButton, Header } from '../lib/ui';

/**
 * Buy v1: guided on-ramp. Card-purchase providers require partner API keys +
 * KYC agreements (MoonPay/Transak) — that's a post-village signup, so v1
 * links out with the address ready instead of faking an integration.
 */
export default function Buy({ onBack }: { onBack: () => void }) {
  const wallet = useWallet();
  const { t } = usePrefs();

  const providers = [
    {
      name: 'MoonPay',
      detail: 'Card / Apple Pay → SOL, USDC',
      url: `https://www.moonpay.com/buy/sol`,
    },
    {
      name: 'Transak',
      detail: 'Card / bank transfer → SOL, USDC',
      url: `https://global.transak.com/?defaultCryptoCurrency=SOL&network=solana&walletAddress=${wallet.address}`,
    },
  ];

  return (
    <div className="screen-in flex h-full flex-col">
      <Header title={t('buy')} onBack={onBack} />
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <div className="card !py-3">
          <div className="label mb-1">Your address (paste at checkout)</div>
          <div className="flex items-center gap-2">
            <div className="selectable flex-1 break-all font-mono text-[11px]">{wallet.address}</div>
            <CopyButton text={wallet.address} small />
          </div>
        </div>

        <span className="label">Buy with card</span>
        {providers.map((p) => (
          <a key={p.name} className="card tap-row flex items-center gap-3 !py-3" href={p.url} target="_blank" rel="noreferrer">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{p.name} ↗</span>
              <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {p.detail}
              </span>
            </div>
          </a>
        ))}

        <span className="label">Or from an exchange</span>
        <div className="card !py-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
          Buy on any exchange you already use and withdraw to your address above on the{' '}
          <span style={{ color: 'var(--text)' }}>Solana network</span>. And when you later send funds{' '}
          <span style={{ color: 'var(--text)' }}>back</span> to an exchange — that's exactly the moment Marani's
          guardian checks the token is actually supported there, so you never lose a deposit.
        </div>

        <p className="px-1 text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Direct in-wallet card checkout (embedded MoonPay/Transak widget with your address pre-filled) ships once
          provider API keys are approved — the flow above is the honest v1.
        </p>
      </div>
    </div>
  );
}
