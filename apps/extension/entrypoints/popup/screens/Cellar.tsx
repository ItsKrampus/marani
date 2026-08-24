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

function apyOf(v: Venue | null): number | null {
  return v ? v.apyPct : null;
}

export default function Cellar() {
  const wallet = useWallet();
  const { t, mask } = usePrefs();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [step, setStep] = useState<Step>('input');
  const [amountStr, setAmountStr] = useState('');
  const [quote, setQuote] = useState<JupQuote | null>(null);
  const [sig, setSig] = useState('');
  const [error, setError] = useState('');

  const solRow = wallet.rows.find((r) => r.mint === null) ?? null;
  const usdcRow = wallet.rows.find((r) => r.mint === USDC_MINT) ?? null;
  const jlUsdcRow = wallet.rows.find((r) => r.mint === JLUSDC_MINT) ?? null;

  const venueFor = (lst: LstOption): Venue | null => (lst.symbol === 'jitoSOL' ? yields.venues.jitosol : yields.venues.msol);

  interface Position {
    row: TokenRow;
    lst: LstOption | null; // null = Jupiter Lend
    venueName: string;
    apy: number | null;
  }
  const positions: Position[] = [
    ...LST_OPTIONS.map((lst) => {
      const row = wallet.rows.find((r) => r.mint === lst.mint);
      return row && row.amountRaw > 0n
        ? { row, lst, venueName: lst.provider, apy: apyOf(venueFor(lst)) }
        : null;
    }).filter((p): p is Position => p !== null),
    ...(jlUsdcRow && jlUsdcRow.amountRaw > 0n
      ? [{ row: jlUsdcRow, lst: null, venueName: 'Jupiter Lend', apy: apyOf(yields.venues.jupiterLendUsdc) }]
      : []),
  ];
  const totalStakedUsd = positions.reduce((s, p) => s + (p.row.usdValue ?? 0), 0);
  const blendedApy =
    totalStakedUsd > 0
      ? positions.reduce((s, p) => s + (p.apy ?? 0) * (p.row.usdValue ?? 0), 0) / totalStakedUsd
      : null;

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

  const inputDecimals = flow?.kind === 'deposit' ? 6 : 9;
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

  // ---------------- main view (per "Marani Extension" design, Cellar screen) ----------------
  const poolRows: Array<{
    key: string;
    symbol: string;
    logoUri: string | null;
    name: string;
    term: string;
    apy: number | null;
    tvl: number | null;
    cta: string;
    disabled: boolean;
    onClick?: () => void;
    soon?: boolean;
  }> = [
    ...LST_OPTIONS.map((lst) => ({
      key: lst.mint,
      symbol: lst.symbol,
      logoUri: wallet.rows.find((r) => r.mint === lst.mint)?.logoUri ?? null,
      name: `${lst.provider} · ${lst.symbol}`,
      term: t('poolsHint'),
      apy: apyOf(venueFor(lst)),
      tvl: venueFor(lst)?.tvlUsd ?? null,
      cta: t('stake'),
      disabled: !solRow || solRow.amountRaw <= STAKE_SOL_BUFFER,
      onClick: () => start({ kind: 'stake', lst }),
    })),
    {
      key: 'juplend',
      symbol: 'USDC',
      logoUri: usdcRow?.logoUri ?? null,
      name: 'Jupiter Lend · USDC',
      term: !usdcRow || usdcRow.amountRaw === 0n ? 'No USDC yet — grab some via Swap' : t('poolsHint'),
      apy: apyOf(yields.venues.jupiterLendUsdc),
      tvl: yields.venues.jupiterLendUsdc?.tvlUsd ?? null,
      cta: t('deposit'),
      disabled: !usdcRow || usdcRow.amountRaw === 0n,
      onClick: () => start({ kind: 'deposit' }),
    },
    {
      key: 'kamino',
      symbol: 'USDC',
      logoUri: null,
      name: 'Kamino Lend · USDC',
      term: 'SDK integration in progress',
      apy: apyOf(yields.venues.kaminoLendUsdc),
      tvl: yields.venues.kaminoLendUsdc?.tvlUsd ?? null,
      cta: t('soon'),
      disabled: true,
      soon: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4 pt-1">
      {/* total staked */}
      <div className="flex flex-col items-center gap-1 pt-1">
        <span className="label">{t('totalStaked')}</span>
        <span className="font-display text-[32px] leading-[1.1]">
          {mask(totalStakedUsd > 0 ? fmtUsd(totalStakedUsd) : '$0.00')}
        </span>
        {blendedApy !== null && (
          <span className="text-xs" style={{ color: 'var(--green)' }}>
            ≈ {blendedApy.toFixed(2)}% APY
          </span>
        )}
      </div>

      {/* position cards */}
      {positions.map((p, i) => {
        const sharePct = totalStakedUsd > 0 ? Math.round(((p.row.usdValue ?? 0) / totalStakedUsd) * 100) : 100;
        return (
          <div
            key={p.row.mint}
            className="flex flex-col gap-3 rounded-[14px] p-3.5"
            style={{ background: 'linear-gradient(160deg, #2A0D1B, #1F161E)', border: '1px solid var(--border-accent)' }}
          >
            <div className="flex items-center gap-3">
              <Logo size={26} />
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="font-display text-sm">Your Qvevri #{i + 1}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-2)' }} title={formatRawAmount(p.row.amountRaw, p.row.decimals)}>
                  {mask(`${formatAmountCompact(p.row.amountRaw, p.row.decimals)} ${p.row.symbol}`)} aging
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {p.apy !== null && (
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--green)' }}>
                    {p.apy.toFixed(1)}% APY
                  </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                  {p.venueName}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg)' }}>
                <span
                  className="flex rounded-full"
                  style={{ width: `${Math.max(sharePct, 4)}%`, background: 'linear-gradient(90deg, #7A1533, #E0A458)' }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span style={{ color: 'var(--text-3)' }}>
                  {t('shareOfCellar')} · {sharePct}%
                </span>
                <span style={{ color: 'var(--text-2)' }}>{mask(p.row.usdValue !== null ? fmtUsd(p.row.usdValue) : '')}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-full py-2 text-[11px] font-semibold cursor-pointer"
                style={{ border: '1px solid var(--border-accent)', color: 'var(--text)' }}
                onClick={() => (p.lst ? start({ kind: 'stake', lst: p.lst }) : start({ kind: 'deposit' }))}
              >
                {t('addMore')}
              </button>
              <button
                className="flex-1 rounded-full py-2 text-[11px] font-semibold cursor-pointer"
                style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}
                onClick={() => (p.lst ? start({ kind: 'unstake', lst: p.lst, row: p.row }) : start({ kind: 'withdraw', row: p.row }))}
              >
                {p.lst ? t('unstake') : t('withdrawAll')}
              </button>
            </div>
          </div>
        );
      })}

      {/* pools */}
      <div className="flex items-center justify-between">
        <span className="label">{t('pools')}</span>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {t('poolsHint')}
        </span>
      </div>
      {(!solRow || solRow.amountRaw <= STAKE_SOL_BUFFER) && (
        <div className="rounded-xl px-3 py-2 text-[11px] leading-relaxed" style={{ background: '#2A2010', border: '1px solid #6B4E1F', color: 'var(--gold)' }}>
          Staking needs a little working SOL: your amount <span style={{ color: 'var(--text-2)' }}>plus ~0.003 SOL</span>{' '}
          for the temporary wrap rent (refunded) and fees. You have{' '}
          {formatRawAmount(solRow?.amountRaw ?? 0n, 9, 5)} SOL — top up to at least ~0.005 SOL to try it.
        </div>
      )}
      <div className="flex flex-col gap-2">
        {poolRows.map((pool) => (
          <div key={pool.key} className="card flex items-center gap-2.5 !py-2.5" style={pool.soon ? { opacity: 0.7 } : undefined}>
            <TokenIcon symbol={pool.symbol} logoUri={pool.logoUri} size={30} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{pool.name}</span>
              <span className="truncate text-[10px]" style={{ color: 'var(--text-3)' }}>
                {pool.term}
                {pool.tvl ? ` · $${(pool.tvl / 1e6).toFixed(0)}M TVL` : ''}
              </span>
            </div>
            {pool.apy !== null && (
              <span className="pr-1 text-[13px] font-semibold" style={{ color: 'var(--green)' }}>
                {pool.apy.toFixed(1)}%
              </span>
            )}
            <button
              className="rounded-full px-3 py-1.5 text-[11px] font-semibold cursor-pointer disabled:cursor-default disabled:opacity-50"
              style={{ background: 'var(--gold)', color: '#14090E' }}
              disabled={pool.disabled}
              onClick={pool.onClick}
            >
              {pool.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="px-2 pb-1 text-center text-[10px] leading-relaxed" style={{ color: 'var(--inactive)' }}>
        {t('cellarFootnote')} Rates: DefiLlama, {yields.updatedAt.slice(0, 10)}.
      </p>
    </div>
  );
}
