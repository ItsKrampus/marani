import { formatRawAmount, shortAddress } from '@marani/core';
import React, { useState } from 'react';
import { Brand } from '../App';
import { useWallet, type TokenRow } from '../lib/wallet';
import { CopyButton, Spinner } from '../lib/ui';
import Send from './Send';
import Receive from './Receive';
import Activity from './Activity';
import Settings from './Settings';

type Route = 'home' | 'send' | 'receive' | 'activity' | 'settings';

export default function Home() {
  const wallet = useWallet();
  const [route, setRoute] = useState<Route>('home');
  const [presetToken, setPresetToken] = useState<TokenRow | null>(null);

  if (route === 'send') return <Send onBack={() => { setRoute('home'); wallet.refresh(); }} preset={presetToken} />;
  if (route === 'receive') return <Receive onBack={() => setRoute('home')} />;
  if (route === 'activity') return <Activity onBack={() => setRoute('home')} />;
  if (route === 'settings') return <Settings onBack={() => setRoute('home')} />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 pb-2">
        <Brand />
        <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setRoute('settings')}>
          ⚙
        </button>
      </div>

      <div className="mx-4 card flex items-center justify-between !py-3">
        <div>
          <div className="label">Account 1</div>
          <div className="text-sm font-mono">{shortAddress(wallet.address, 6)}</div>
        </div>
        <CopyButton text={wallet.address} small />
      </div>

      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        <button className="btn btn-primary" onClick={() => { setPresetToken(null); setRoute('send'); }}>
          Send
        </button>
        <button className="btn btn-ghost" onClick={() => setRoute('receive')}>
          Receive
        </button>
        <button className="btn btn-ghost" onClick={() => setRoute('activity')}>
          Activity
        </button>
      </div>

      <div className="mx-4 mt-4 mb-1 flex items-center justify-between">
        <div className="label">Assets</div>
        <button className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer" onClick={wallet.refresh}>
          refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
        {wallet.loading && <Spinner label="Reading balances…" />}
        {wallet.loadError && <div className="text-xs text-red-400">RPC error: {wallet.loadError}</div>}
        {!wallet.loading &&
          wallet.rows.map((row) => (
            <button
              key={row.mint ?? 'SOL'}
              className="card flex items-center justify-between !py-3 text-left hover:bg-white/[0.07] cursor-pointer"
              onClick={() => { setPresetToken(row); setRoute('send'); }}
            >
              <div className="min-w-0">
                <div className="text-sm font-bold flex items-center gap-1.5">
                  {row.symbol}
                  {row.program === 'token-2022' && (
                    <span className="rounded bg-purple-950 px-1 text-[9px] text-purple-300 border border-purple-800">
                      T-2022
                    </span>
                  )}
                  {!row.verified && row.mint && (
                    <span className="rounded bg-zinc-800 px-1 text-[9px] text-zinc-400">unverified</span>
                  )}
                </div>
                <div className="truncate text-xs text-zinc-500">{row.name}</div>
              </div>
              <div className="text-sm font-mono">{formatRawAmount(row.amountRaw, row.decimals, 5)}</div>
            </button>
          ))}
        {!wallet.loading && wallet.rows.length === 1 && wallet.rows[0]!.amountRaw === 0n && (
          <div className="card text-xs text-zinc-500 leading-relaxed">
            This wallet is empty. Hit <span className="text-zinc-300">Receive</span> to get your address and fund it
            with a little SOL to start.
          </div>
        )}
      </div>
    </div>
  );
}
