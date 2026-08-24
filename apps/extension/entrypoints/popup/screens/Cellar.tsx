import {
  executeSwapWithFreshRetry,
  formatAmountCompact,
  formatRawAmount,
  JLUSDC_MINT,
  lendDeposit,
  lendRedeem,
  LST_OPTIONS,
  parseAmount,
  quoteStake,
  quoteUnstake,
  shortAddress,
  USDC_MINT,
  WSOL_MINT,
  type JupQuote,
  type LstOption,
} from '@marani/core';
import yieldsJson from '@marani/preflight/data/yields.json';
import React, { useMemo, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useWallet, type TokenRow } from '../lib/wallet';
import { ErrorNote, fmtUsd, Logo, Spinner, TokenIcon } from '../lib/ui';

interface Venue {
  apyPct: number;
  tvlUsd: number;
}
interface YieldsData {
  updatedAt: string;
  venues: { jitosol: Venue | null; msol: Venue | null; jupiterLendUsdc: Venue | null; kaminoLendUsdc: Venue | null };
}
const yields = yieldsJson as unknown as YieldsData;

const STAKE_SOL_BUFFER = 3_000_000n; // swap fee + temp wSOL wrap rent
/** Dust-sized swaps route through exotic venues and fail preflight — enforce sane floors. */
const MIN_STAKE_LAMPORTS = 10_000_000n; // 0.01 SOL
const MIN_DEPOSIT_USDC = 1_000_000n; // 1 USDC

type Flow =
  | { kind: 'stake'; lst: LstOption }
  | { kind: 'unstake'; lst: LstOption; row: TokenRow }
  | { kind: 'deposit' }
  | { kind: 'withdraw'; row: TokenRow };

type Step = 'input' | 'confirm' | 'executing' | 'done' | 'error';

function ApyChip({ venue }: { venue: Venue | null }) {
  if (!venue) return null;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#0E2018', color: 'var(--green)', border: '1px solid #2E5A45' }}>
      {venue.apyPct.toFixed(2)}% APY
    </span>
  );
}

function tvlText(venue: Venue | null): string {
  if (!venue) return '';
  return `$${(venue.tvlUsd / 1e6).toFixed(0)}M TVL`;
}

export default function Cellar() {
  const wallet = useWallet();
  const { t } = usePrefs();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [step, setStep] = useState<Step>('input');
  const [amountStr, setAmountStr] = useState('');
  const [quote, setQuote] = useState<JupQuote | null>(null);
  const [sig, setSig] = useState('');
  const [error, setError] = useState('');

  const solRow = wallet.rows.find((r) => r.mint === null) ?? null;
  const usdcRow = wallet.rows.find((r) => r.mint === USDC_MINT) ?? null;
  const jlUsdcRow = wallet.rows.find((r) => r.mint === JLUSDC_MINT) ?? null;
  const lstRows = LST_OPTIONS.map((lst) => ({ lst, row: wallet.rows.find((r) => r.mint === lst.mint) ?? null }));

  const venueFor = (lst: LstOption): Venue | null => (lst.symbol === 'jitoSOL' ? yields.venues.jitosol : yields.venues.msol);

  const reset = () => {
    setFlow(null);
    setStep('input');
    setAmountStr('');
    setQuote(null);
    setSig('');
    setError('');
  };

  const start = (f: Flow) => {
    reset();
    setFlow(f);
    if (f.kind === 'withdraw') setStep('confirm');
  };

  const inputDecimals = flow?.kind === 'stake' ? 9 : flow?.kind === 'unstake' ? 9 : 6;
  const inputMax: bigint = useMemo(() => {
    if (!flow) return 0n;
    if (flow.kind === 'stake') {
      const bal = solRow?.amountRaw ?? 0n;
      return bal > STAKE_SOL_BUFFER ? bal - STAKE_SOL_BUFFER : 0n;
    }
    if (flow.kind === 'unstake') return flow.row.amountRaw;
    if (flow.kind === 'deposit') return usdcRow?.amountRaw ?? 0n;
    return 0n;
  }, [flow, solRow, usdcRow]);

  const amountRaw = useMemo(() => {
    if (!amountStr) return null;
    try {
      const raw = parseAmount(amountStr, inputDecimals);
      return raw > 0n && raw <= inputMax ? raw : null;
    } catch {
      return null;
    }
  }, [amountStr, inputDecimals, inputMax]);

  const minRaw = flow?.kind === 'stake' ? MIN_STAKE_LAMPORTS : flow?.kind === 'deposit' ? MIN_DEPOSIT_USDC : 0n;
  const belowMin = amountRaw !== null && amountRaw < minRaw;
  const smallUnstake = flow?.kind === 'unstake' && amountRaw !== null && amountRaw < MIN_STAKE_LAMPORTS;

  const getQuote = async () => {
    if (!flow || amountRaw === null || (flow.kind !== 'stake' && flow.kind !== 'unstake')) return;
    setStep('confirm');
    setQuote(null);
    setError('');
    try {
      const q =
        flow.kind === 'stake'
          ? await quoteStake({ solLamports: amountRaw, lstMint: flow.lst.mint })
          : await quoteUnstake({ lstMint: flow.lst.mint, amountRaw });
      setQuote(q);
    } catch (e) {
      setError((e as Error).message);
      setStep('error');
    }
  };

  const execute = async () => {
    if (!flow) return;
    setStep('executing');
    setError('');
    try {
      let res;
      if (flow.kind === 'stake' || flow.kind === 'unstake') {
        if (!quote) throw new Error('no quote');
        res = await executeSwapWithFreshRetry(wallet.rpc, wallet.signer, {
          inputMint: flow.kind === 'stake' ? WSOL_MINT : flow.lst.mint,
          outputMint: flow.kind === 'stake' ? flow.lst.mint : WSOL_MINT,
          amountRaw: quote.inAmountRaw,
          slippageBps: quote.slippageBps,
          initialQuote: quote,
        });
      } else if (flow.kind === 'deposit') {
        if (amountRaw === null) throw new Error('no amount');
        res = await lendDeposit(wallet.rpc, wallet.signer, { assetMint: USDC_MINT, amountRaw });
      } else {
        res = await lendRedeem(wallet.rpc, wallet.signer, { assetMint: USDC_MINT, sharesRaw: flow.row.amountRaw });
      }
      if (!res.confirmed) throw new Error('Transaction not confirmed — check Activity');
      setSig(res.signature);
      setStep('done');
      wallet.refresh();
    } catch (e) {
      setError((e as Error).message);
      setStep('error');
    }
  };

  // ---------------- flow panel ----------------
  if (flow) {
    const title =
      flow.kind === 'stake'
        ? `${t('stake')} SOL → ${flow.lst.symbol}`
        : flow.kind === 'unstake'
          ? `${t('unstake')} ${flow.lst.symbol}`
          : flow.kind === 'deposit'
            ? `${t('deposit')} USDC — Jupiter Lend`
            : `${t('withdrawAll')} — Jupiter Lend`;
    return (
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          <button className="cursor-pointer text-lg leading-none" style={{ color: 'var(--text-3)' }} onClick={reset}>
            ←
          </button>
          <span className="font-display text-sm">{title}</span>
        </div>

        {step === 'input' && (
          <>
            <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              Available: {formatRawAmount(inputMax, inputDecimals, 5)}{' '}
              {flow.kind === 'stake' ? 'SOL' : flow.kind === 'unstake' ? flow.lst.symbol : 'USDC'}
              {flow.kind === 'stake' ? ' (0.003 SOL kept for fees)' : ''}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="0.00"
                inputMode="decimal"
                value={amountStr}
                autoFocus
                onChange={(e) => setAmountStr(e.target.value)}
              />
              <button className="btn btn-ghost text-xs" onClick={() => setAmountStr(formatRawAmount(inputMax, inputDecimals))}>
                {t('max')}
              </button>
            </div>
            {belowMin && (
              <div className="text-[11px]" style={{ color: 'var(--red)' }}>
                Minimum {flow.kind === 'stake' ? '0.01 SOL' : '1 USDC'} — smaller amounts get unreliable routes and
                usually fail.
              </div>
            )}
            {smallUnstake && (
              <div className="text-[11px]" style={{ color: 'var(--gold)' }}>
                Very small unstakes can fail to route. If it errors, retry — nothing is sent on a failed attempt.
              </div>
            )}
            <button
              className="btn btn-primary mt-1"
              disabled={amountRaw === null || belowMin}
              onClick={() => (flow.kind === 'deposit' ? setStep('confirm') : getQuote())}
            >
              {t('continue')}
            </button>
          </>
        )}

        {step === 'confirm' && (flow.kind === 'stake' || flow.kind === 'unstake') && (
          <>
            {!quote ? (
              <Spinner label="Finding the best route on Jupiter…" />
            ) : (
              <>
                <div className="card flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-3)' }}>You {flow.kind}</span>
                    <span className="font-semibold">
                      {formatRawAmount(quote.inAmountRaw, 9)} {flow.kind === 'stake' ? 'SOL' : flow.lst.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-3)' }}>You receive</span>
                    <span className="font-semibold">
                      ≈ {formatRawAmount(quote.outAmountRaw, 9)} {flow.kind === 'stake' ? flow.lst.symbol : 'SOL'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-3)' }}>Price impact</span>
                    <span>{(quote.priceImpactPct * 100).toFixed(3)}%</span>
                  </div>
                  {flow.kind === 'stake' && venueFor(flow.lst) && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>Staking APY</span>
                      <span style={{ color: 'var(--green)' }}>{venueFor(flow.lst)!.apyPct.toFixed(2)}%</span>
                    </div>
                  )}
                </div>
                <button className="btn btn-primary" onClick={execute}>
                  Confirm {flow.kind === 'stake' ? t('stake') : t('unstake')}
                </button>
              </>
            )}
          </>
        )}

        {step === 'confirm' && flow.kind === 'deposit' && amountRaw !== null && (
          <>
            <div className="card flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>{t('deposit')}</span>
                <span className="font-semibold">{formatRawAmount(amountRaw, 6)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>Current APY</span>
                <span style={{ color: 'var(--green)' }}>{yields.venues.jupiterLendUsdc?.apyPct.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>You receive</span>
                <span>jlUSDC (withdraw any time)</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={execute}>
              Confirm {t('deposit')}
            </button>
          </>
        )}

        {step === 'confirm' && flow.kind === 'withdraw' && (
          <>
            <div className="card flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>Burning</span>
                <span className="font-semibold">{formatRawAmount(flow.row.amountRaw, 6)} jlUSDC</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>You receive</span>
                <span>USDC + accrued yield</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={execute}>
              Confirm {t('withdrawAll')}
            </button>
          </>
        )}

        {step === 'executing' && <Spinner label="Signing and sending…" />}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 pt-4 text-center">
            <div className="text-4xl">🍇</div>
            <div className="text-sm font-bold">{title} — confirmed</div>
            <a
              className="card w-full !py-2 text-xs"
              style={{ color: 'var(--gold)' }}
              href={`https://solscan.io/tx/${sig}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Solscan ↗
              <div className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{shortAddress(sig, 10)}</div>
            </a>
            <button className="btn btn-primary w-full" onClick={reset}>
              {t('done')}
            </button>
          </div>
        )}
        {step === 'error' && (
          <>
            <ErrorNote text={error} />
            <button className="btn btn-ghost" onClick={() => setStep('input')}>
              {t('back')}
            </button>
          </>
        )}
      </div>
    );
  }

  // ---------------- main view ----------------
  const positions = [
    ...lstRows.filter((x) => x.row && x.row.amountRaw > 0n),
    ...(jlUsdcRow && jlUsdcRow.amountRaw > 0n ? [{ lst: null as LstOption | null, row: jlUsdcRow }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ background: 'linear-gradient(160deg, #2A0D1B, #1F161E)', border: '1px solid var(--border-accent)' }}
      >
        <Logo size={28} />
        <div className="flex flex-col">
          <span className="font-display text-sm">{t('cellarTitle')}</span>
          <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
            {t('cellarBody')}
          </span>
        </div>
      </div>

      {positions.length > 0 && (
        <>
          <span className="label">{t('positions')}</span>
          {positions.map(({ lst, row }) => (
            <div key={row!.mint} className="card flex items-center gap-2.5 !py-3">
              <TokenIcon symbol={row!.symbol} logoUri={row!.logoUri} size={28} />
              <div className="flex flex-1 flex-col">
                <span className="text-[13px] font-semibold">{row!.symbol}</span>
                <span className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {formatAmountCompact(row!.amountRaw, row!.decimals)}
                  {row!.usdValue !== null ? ` · ${fmtUsd(row!.usdValue)}` : ''}
                </span>
              </div>
              <button
                className="btn btn-ghost !py-1.5 text-xs"
                onClick={() => (lst ? start({ kind: 'unstake', lst, row: row! }) : start({ kind: 'withdraw', row: row! }))}
              >
                {lst ? t('unstake') : t('withdrawAll')}
              </button>
            </div>
          ))}
        </>
      )}

      <span className="label">{t('stake')} SOL</span>
      {(!solRow || solRow.amountRaw <= STAKE_SOL_BUFFER) && (
        <div className="rounded-xl px-3 py-2 text-[11px] leading-relaxed" style={{ background: '#2A2010', border: '1px solid #6B4E1F', color: 'var(--gold)' }}>
          Staking needs a little working SOL: your amount <span style={{ color: 'var(--text-2)' }}>plus ~0.003 SOL</span>{' '}
          for the temporary wrap rent (refunded) and fees. You have{' '}
          {formatRawAmount(solRow?.amountRaw ?? 0n, 9, 5)} SOL — top up to at least ~0.005 SOL to try it.
        </div>
      )}
      {LST_OPTIONS.map((lst) => {
        const venue = venueFor(lst);
        return (
          <div key={lst.mint} className="card flex items-center gap-2.5 !py-3">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                {lst.provider} · {lst.symbol} <ApyChip venue={venue} />
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                Instant stake & unstake · {tvlText(venue)}
              </span>
            </div>
            <button
              className="btn btn-primary !py-1.5 text-xs"
              disabled={!solRow || solRow.amountRaw <= STAKE_SOL_BUFFER}
              onClick={() => start({ kind: 'stake', lst })}
            >
              {t('stake')}
            </button>
          </div>
        );
      })}

      <span className="label">Earn USDC</span>
      <div className="card flex items-center gap-2.5 !py-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            Jupiter Lend <ApyChip venue={yields.venues.jupiterLendUsdc} />
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {!usdcRow || usdcRow.amountRaw === 0n
              ? 'No USDC in this wallet yet — grab some via Swap first'
              : `Largest USDC pool on Solana · ${tvlText(yields.venues.jupiterLendUsdc)}`}
          </span>
        </div>
        <button
          className="btn btn-primary !py-1.5 text-xs"
          disabled={!usdcRow || usdcRow.amountRaw === 0n}
          onClick={() => start({ kind: 'deposit' })}
        >
          {t('deposit')}
        </button>
      </div>
      <div className="card flex items-center gap-2.5 !py-3" style={{ opacity: 0.75 }}>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            Kamino Lend <ApyChip venue={yields.venues.kaminoLendUsdc} />
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            SDK integration in progress · {tvlText(yields.venues.kaminoLendUsdc)}
          </span>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: 'var(--gold)', color: '#14090E' }}>
          {t('soon')}
        </span>
      </div>

      <p className="px-1 pb-1 text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        Staking = holding jitoSOL/mSOL — yield accrues in the token's price; unstake instantly any time. Rates from
        DefiLlama, updated {yields.updatedAt.slice(0, 10)}. Yield is variable and never guaranteed.
      </p>
    </div>
  );
}
