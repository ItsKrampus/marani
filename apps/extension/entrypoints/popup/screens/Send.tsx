import {
  buildSwapTransaction,
  estimateTransferCost,
  formatRawAmount,
  getMintInfo,
  getPortfolio,
  getSwapQuote,
  isSolanaAddress,
  parseAmount,
  RENT_EXEMPT_MIN_LAMPORTS,
  safeJson,
  sendTransfer,
  SOL_TX_FEE_LAMPORTS,
  shortAddress,
  signAndSendSwap,
  simulateTransfer,
  USDC_MINT,
  type JupQuote,
  type MintInfo,
  type TransferCost,
} from '@marani/core';
import {
  classifyByLabels,
  evaluateCexSend,
  evaluateTokenHazards,
  indexMatrix,
  sweepClassify,
  worstLevel,
  EXCHANGE_NAMES,
  type DestinationClass,
  type ExchangeId,
  type Finding,
  type LabelSet,
  type SupportMatrix,
} from '@marani/preflight';
import matrixJson from '@marani/preflight/data/support-matrix.json';
import labelsJson from '@marani/preflight/data/labels.json';
import React, { useEffect, useMemo, useState } from 'react';
import { getUserMarks, setUserMark } from '../lib/storage';
import { useWallet, type TokenRow } from '../lib/wallet';
import { ErrorNote, FindingBadge, Header, Spinner } from '../lib/ui';

const matrix = matrixJson as unknown as SupportMatrix;
const labels = labelsJson as unknown as LabelSet;
const matrixIndex = indexMatrix(matrix);

type DestState = DestinationClass | { kind: 'not-cex' };

type Step = 'recipient' | 'classifying' | 'ask-exchange' | 'compose' | 'review' | 'rescue' | 'result';

export default function Send({ onBack, preset }: { onBack: () => void; preset: TokenRow | null }) {
  const wallet = useWallet();
  const [step, setStep] = useState<Step>('recipient');
  const [destination, setDestination] = useState('');
  const [destState, setDestState] = useState<DestState | null>(null);
  const [token, setToken] = useState<TokenRow | null>(preset && preset.amountRaw > 0n ? preset : null);
  const [amountStr, setAmountStr] = useState('');
  const [mintInfo, setMintInfo] = useState<MintInfo | null>(null);
  const [error, setError] = useState('');
  const [ackDanger, setAckDanger] = useState(false);

  // review state
  const [simState, setSimState] = useState<'idle' | 'running' | 'ok' | 'failed'>('idle');
  const [simDetail, setSimDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [cost, setCost] = useState<TransferCost | null>(null);

  // rescue state
  const [rescueQuote, setRescueQuote] = useState<JupQuote | null>(null);
  const [rescuePhase, setRescuePhase] = useState<'quoting' | 'confirm' | 'swapping' | 'sending' | 'error'>('quoting');
  const [rescueError, setRescueError] = useState('');

  const [result, setResult] = useState<{ title: string; sigs: { label: string; sig: string }[] } | null>(null);

  // ---- destination classification ----
  const classify = async (addr: string) => {
    setStep('classifying');
    const marks = await getUserMarks();
    const byLabel = classifyByLabels(addr, labels, marks);
    if (byLabel.kind !== 'unknown') {
      setDestState(byLabel);
      setStep('compose');
      return;
    }
    const swept = await sweepClassify({ rpc: wallet.rpc, destination: addr, labels }).catch(() => null);
    if (swept) {
      setDestState(swept);
      setStep('compose');
      return;
    }
    setStep('ask-exchange');
  };

  // ---- transfer cost (fee + recipient-ATA rent) when entering review ----
  useEffect(() => {
    if (step !== 'review' || !token || amountRaw === null) return;
    let cancelled = false;
    setCost(null);
    estimateTransferCost(wallet.rpc, transferSpec())
      .then((c) => !cancelled && setCost(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ---- token hazards (mint extensions) ----
  useEffect(() => {
    setMintInfo(null);
    if (!token?.mint) return;
    let cancelled = false;
    getMintInfo(wallet.rpc, token.mint)
      .then((mi) => !cancelled && setMintInfo(mi))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token?.mint, wallet.rpc]);

  // ---- findings ----
  const findings: Finding[] = useMemo(() => {
    if (!token || !destState) return [];
    const ctx = {
      mint: token.mint,
      symbol: token.symbol,
      program: token.program,
      transferFeeBps: mintInfo?.transferFeeBps,
      hasTransferHook: mintInfo?.hasTransferHook,
      hasPermanentDelegate: mintInfo?.hasPermanentDelegate,
    };
    const out: Finding[] = [];
    if (destState.kind === 'cex') out.push(...evaluateCexSend(destState, ctx, matrixIndex));
    out.push(...evaluateTokenHazards(ctx));
    return out;
  }, [token, destState, mintInfo]);

  const verdict = worstLevel(findings);
  const blocked = verdict === 'block';
  const rescueMint = findings.find((f) => f.rescue)?.rescue?.suggestedMints[0];

  const amountRaw = useMemo(() => {
    if (!token || !amountStr) return null;
    try {
      const raw = parseAmount(amountStr, token.decimals);
      return raw > 0n ? raw : null;
    } catch {
      return null;
    }
  }, [amountStr, token]);

  const maxRaw = token
    ? token.mint === null
      ? token.amountRaw > SOL_TX_FEE_LAMPORTS
        ? token.amountRaw - SOL_TX_FEE_LAMPORTS
        : 0n
      : token.amountRaw
    : 0n;
  const overMax = amountRaw !== null && amountRaw > maxRaw;
  // Solana rejects transfers leaving the sender with 0 < remainder < the rent-exempt minimum.
  const solRemainder =
    token?.mint === null && amountRaw !== null ? token.amountRaw - amountRaw - SOL_TX_FEE_LAMPORTS : null;
  const rentDust = solRemainder !== null && solRemainder > 0n && solRemainder < RENT_EXEMPT_MIN_LAMPORTS;
  const composeReady = amountRaw !== null && !overMax && !rentDust && token !== null;
  const sendableRows = wallet.rows.filter((r) => r.amountRaw > 0n);

  const transferSpec = () =>
    ({
      signer: wallet.signer,
      destination,
      amountRaw: amountRaw!,
      token: token!.mint ? { mint: token!.mint, decimals: token!.decimals, program: token!.program! } : null,
    }) as const;

  // ---- normal send path ----
  const runSimulation = async () => {
    setSimState('running');
    setSimDetail('');
    try {
      const sim = await simulateTransfer(wallet.rpc, transferSpec());
      if (sim.ok) {
        setSimState('ok');
        setSimDetail(`${sim.unitsConsumed ?? '?'} compute units`);
      } else {
        setSimState('failed');
        const lastLog = sim.logs.at(-1);
        setSimDetail(safeJson(sim.err, 140) + (lastLog ? ` — ${lastLog.slice(0, 120)}` : ''));
      }
    } catch (e) {
      setSimState('failed');
      setSimDetail((e as Error).message.slice(0, 160));
    }
  };

  const runSend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await sendTransfer(wallet.rpc, transferSpec());
      if (!res.confirmed) throw new Error(`Not confirmed: ${safeJson(res.err, 120)}`);
      setResult({ title: `Sent ${amountStr} ${token!.symbol}`, sigs: [{ label: 'Transfer', sig: res.signature }] });
      setStep('result');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // ---- rescue path: swap to USDC, then send USDC ----
  const startRescue = async () => {
    if (!token?.mint || !rescueMint || amountRaw === null) return;
    setStep('rescue');
    setRescuePhase('quoting');
    setRescueError('');
    try {
      const quote = await getSwapQuote({ inputMint: token.mint, outputMint: rescueMint, amountRaw });
      setRescueQuote(quote);
      setRescuePhase('confirm');
    } catch (e) {
      setRescueError((e as Error).message);
      setRescuePhase('error');
    }
  };

  const executeRescue = async () => {
    if (!rescueQuote || !token) return;
    try {
      setRescuePhase('swapping');
      const before = await getPortfolio(wallet.rpc, wallet.signer.address);
      const usdcBefore = before.tokens.find((t) => t.mint === USDC_MINT)?.amountRaw ?? 0n;

      const swapTx = await buildSwapTransaction({ quote: rescueQuote, userPublicKey: wallet.address });
      const swapRes = await signAndSendSwap(wallet.rpc, wallet.signer, swapTx);
      if (!swapRes.confirmed) throw new Error(`Swap not confirmed: ${safeJson(swapRes.err, 120)}`);

      setRescuePhase('sending');
      const after = await getPortfolio(wallet.rpc, wallet.signer.address);
      const usdcAfter = after.tokens.find((t) => t.mint === USDC_MINT)?.amountRaw ?? 0n;
      const delta = usdcAfter - usdcBefore;
      const minOut = (rescueQuote.outAmountRaw * BigInt(10_000 - rescueQuote.slippageBps)) / 10_000n;
      const sendAmount = delta > 0n ? delta : minOut;

      const sendRes = await sendTransfer(wallet.rpc, {
        signer: wallet.signer,
        destination,
        amountRaw: sendAmount,
        token: { mint: USDC_MINT, decimals: 6, program: 'token' },
      });
      if (!sendRes.confirmed) throw new Error(`USDC send not confirmed: ${safeJson(sendRes.err, 120)}`);

      setResult({
        title: `Rescued: swapped ${token.symbol} → USDC and sent`,
        sigs: [
          { label: `Swap ${token.symbol}→USDC`, sig: swapRes.signature },
          { label: `Send ${formatRawAmount(sendAmount, 6)} USDC`, sig: sendRes.signature },
        ],
      });
      setStep('result');
    } catch (e) {
      setRescueError((e as Error).message);
      setRescuePhase('error');
    }
  };

  // ================= RENDER =================
  const destBadge = destState?.kind === 'cex' && (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span
        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
        style={{ background: '#2A0D1B', border: '1px solid #7A1533', color: '#F3C983' }}
      >
        {EXCHANGE_NAMES[destState.exchange]} DEPOSIT ADDRESS
      </span>
      <span style={{ color: 'var(--text-3)' }}>via {destState.via === 'user' ? 'your confirmation' : destState.via}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Header title="Send" onBack={step === 'result' ? onBack : step === 'recipient' ? onBack : () => setStep('recipient')} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
        {/* ---------- STEP: recipient ---------- */}
        {step === 'recipient' && (
          <>
            <div className="label">Recipient</div>
            <input
              className="input font-mono text-xs"
              placeholder="Solana address"
              value={destination}
              onChange={(e) => setDestination(e.target.value.trim())}
              autoFocus
            />
            {destination && !isSolanaAddress(destination) && (
              <div className="text-xs text-red-400">Not a valid Solana address.</div>
            )}
            {destination === wallet.address && <div className="text-xs text-amber-400">That's your own address.</div>}
            <div className="card !py-3 text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-semibold">Marani checks before you send.</span> If this address belongs
              to an exchange, we verify the token is actually supported there — the mistake that loses people{' '}
              <span className="text-zinc-200">$84M+ a year</span> on Binance alone.
            </div>
            <button
              className="btn btn-primary mt-auto"
              disabled={!isSolanaAddress(destination)}
              onClick={() => classify(destination)}
            >
              Continue
            </button>
          </>
        )}

        {/* ---------- STEP: classifying ---------- */}
        {step === 'classifying' && (
          <div className="m-auto flex flex-col items-center gap-3">
            <Spinner label="Analyzing destination…" />
            <div className="text-[11px] text-zinc-600 text-center max-w-[240px]">
              checking known exchange wallets and on-chain sweep patterns
            </div>
          </div>
        )}

        {/* ---------- STEP: ask-exchange ---------- */}
        {step === 'ask-exchange' && (
          <>
            <div className="card">
              <div className="text-sm font-bold">Is this an exchange deposit address?</div>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                We couldn't identify <span className="font-mono">{shortAddress(destination, 6)}</span> — fresh deposit
                addresses have no history yet. Tell us where it's from so we can protect the transfer.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(EXCHANGE_NAMES) as ExchangeId[]).map((ex) => (
                <button
                  key={ex}
                  className="btn btn-ghost !py-2 text-xs"
                  onClick={async () => {
                    await setUserMark(destination, ex);
                    setDestState({ kind: 'cex', exchange: ex, via: 'user' });
                    setStep('compose');
                  }}
                >
                  {EXCHANGE_NAMES[ex]}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary mt-auto"
              onClick={async () => {
                await setUserMark(destination, 'not-cex');
                setDestState({ kind: 'not-cex' });
                setStep('compose');
              }}
            >
              No — it's a regular wallet
            </button>
          </>
        )}

        {/* ---------- STEP: compose ---------- */}
        {step === 'compose' && (
          <>
            <div className="text-xs text-zinc-500 font-mono">→ {shortAddress(destination, 8)}</div>
            {destBadge}
            {destState?.kind === 'not-cex' && (
              <div className="text-[11px] text-zinc-500">Marked as a regular wallet (not an exchange).</div>
            )}

            {wallet.loading && <Spinner label="Reading balances…" />}
            {wallet.loadError && (
              <div className="card !border-red-800 !bg-red-950/40 !py-3">
                <div className="text-xs font-bold text-red-300">Couldn't load balances</div>
                <p className="mt-1 text-[11px] text-zinc-300 break-words">{wallet.loadError}</p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  The free public RPC rate-limits bursts. Retry, or paste a free Helius RPC URL in Settings.
                </p>
                <button className="btn btn-ghost mt-2 text-xs" onClick={wallet.refresh}>
                  Retry
                </button>
              </div>
            )}
            {!wallet.loading && !wallet.loadError && sendableRows.length === 0 && (
              <div className="card !py-3 text-[11px] text-zinc-400">
                No balances to send yet. Fund this wallet first (Receive), then come back.
              </div>
            )}

            <div className="label mt-1">Asset</div>
            <select
              className="input"
              value={token ? (token.mint ?? 'SOL') : ''}
              onChange={(e) => {
                const v = e.target.value;
                setToken(wallet.rows.find((r) => (r.mint ?? 'SOL') === v) ?? null);
                setAckDanger(false);
              }}
            >
              <option value="" disabled>
                {sendableRows.length === 0 ? 'No tokens available' : 'Select a token'}
              </option>
              {sendableRows.map((r) => (
                <option key={r.mint ?? 'SOL'} value={r.mint ?? 'SOL'}>
                  {r.symbol} — {formatRawAmount(r.amountRaw, r.decimals, 5)}
                </option>
              ))}
            </select>

            <div className="label mt-1">Amount</div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="0.00"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
              <button
                className="btn btn-ghost text-xs"
                disabled={!token}
                onClick={() => token && setAmountStr(formatRawAmount(maxRaw, token.decimals))}
              >
                Max
              </button>
            </div>
            {overMax && (
              <div className="text-xs text-red-400">
                Exceeds available balance{token?.mint === null ? ' (0.000017 SOL reserved for the network fee)' : ''}.
              </div>
            )}
            {rentDust && solRemainder !== null && (
              <div className="card !border-amber-800 !bg-amber-950/30 !py-3">
                <div className="flex items-center gap-2">
                  <FindingBadge level="warn" />
                  <div className="text-xs font-bold">Solana would reject this amount</div>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                  It would leave {formatRawAmount(solRemainder, 9)} SOL behind — below the 0.00089 SOL rent-exempt
                  minimum, so the network refuses the transfer. Send everything, or leave at least 0.00089 SOL.
                </p>
                <button
                  className="btn btn-ghost mt-2 text-xs"
                  onClick={() => setAmountStr(formatRawAmount(maxRaw, 9))}
                >
                  Send Max ({formatRawAmount(maxRaw, 9)} SOL) instead
                </button>
              </div>
            )}

            {/* preflight verdict */}
            {token && destState && findings.length > 0 && (
              <div
                className={`card flex flex-col gap-2 ${
                  verdict === 'block'
                    ? '!border-red-800 !bg-red-950/40'
                    : verdict === 'warn'
                      ? '!border-amber-800 !bg-amber-950/30'
                      : '!border-emerald-800 !bg-emerald-950/20'
                }`}
              >
                {findings.map((f, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <FindingBadge level={f.level} />
                      <div className="text-xs font-bold">{f.title}</div>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{f.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {blocked ? (
              <div className="mt-auto flex flex-col gap-2">
                {rescueMint && (
                  <button className="btn btn-primary" disabled={!composeReady} onClick={startRescue}>
                    🛟 Swap to USDC & send safely
                  </button>
                )}
                <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <input type="checkbox" checked={ackDanger} onChange={(e) => setAckDanger(e.target.checked)} />
                  I understand my funds will likely be lost
                </label>
                <button
                  className="btn btn-danger"
                  disabled={!composeReady || !ackDanger}
                  onClick={() => { setSimState('idle'); setSimDetail(''); setError(''); setStep('review'); }}
                >
                  Send {token?.symbol} anyway
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary mt-auto"
                disabled={!composeReady || (Boolean(token?.mint) && !mintInfo)}
                onClick={() => { setSimState('idle'); setSimDetail(''); setError(''); setStep('review'); }}
              >
                Review
              </button>
            )}
          </>
        )}

        {/* ---------- STEP: review ---------- */}
        {step === 'review' && token && amountRaw !== null && (
          <>
            <div className="card flex flex-col gap-2 text-sm">
              <Row k="Sending" v={`${formatRawAmount(amountRaw, token.decimals)} ${token.symbol}`} />
              <Row k="To" v={shortAddress(destination, 8)} mono />
              {destState?.kind === 'cex' && <Row k="Destination" v={`${EXCHANGE_NAMES[destState.exchange]} deposit`} />}
              <Row k="Network fee" v="0.000017 SOL" />
              {cost && cost.ataRentLamports > 0n && (
                <Row k="Recipient account rent (one-time)" v={`${formatRawAmount(cost.ataRentLamports, 9)} SOL`} />
              )}
              <Row k="Token program" v={token.program ?? 'system'} />
            </div>
            {(() => {
              const solBalance = wallet.rows.find((r) => r.mint === null)?.amountRaw ?? 0n;
              const needSol =
                (cost?.feeLamports ?? SOL_TX_FEE_LAMPORTS) +
                (cost?.ataRentLamports ?? 0n) +
                (token.mint === null ? amountRaw : 0n);
              if (!cost || solBalance >= needSol) return null;
              return (
                <div className="card !border-red-800 !bg-red-950/40 !py-3">
                  <div className="text-xs font-bold text-red-300">Not enough SOL to cover this transfer</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                    This send needs {formatRawAmount(needSol, 9)} SOL
                    {cost.ataRentLamports > 0n
                      ? ' (network fee + one-time creation of the recipient’s token account)'
                      : ''}
                    , but this wallet holds {formatRawAmount(solBalance, 9)} SOL. Top up a little SOL and try again.
                  </p>
                </div>
              );
            })()}

            <div className="card !py-3">
              {simState === 'idle' && (
                <button className="btn btn-ghost w-full" onClick={runSimulation}>
                  Simulate transaction
                </button>
              )}
              {simState === 'running' && <Spinner label="Simulating on mainnet…" />}
              {simState === 'ok' && <div className="text-xs text-emerald-400">✓ Simulation passed — {simDetail}</div>}
              {simState === 'failed' && <ErrorNote text={`Simulation failed: ${simDetail}`} />}
            </div>

            {error && <ErrorNote text={error} />}
            <button className="btn btn-primary mt-auto" disabled={simState !== 'ok' || sending} onClick={runSend}>
              {sending ? 'Sending…' : 'Confirm & send'}
            </button>
          </>
        )}

        {/* ---------- STEP: rescue ---------- */}
        {step === 'rescue' && token && (
          <>
            <div className="card">
              <div className="text-sm font-bold">🛟 Rescue swap</div>
              <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                Instead of losing your {token.symbol}, Marani swaps it to USDC on Jupiter and sends USDC — which{' '}
                {destState?.kind === 'cex' ? EXCHANGE_NAMES[destState.exchange] : 'the exchange'} does support.
              </p>
            </div>
            {rescuePhase === 'quoting' && <Spinner label="Getting the best route on Jupiter…" />}
            {rescuePhase === 'confirm' && rescueQuote && (
              <>
                <div className="card flex flex-col gap-2 text-sm">
                  <Row k="You swap" v={`${formatRawAmount(rescueQuote.inAmountRaw, token.decimals)} ${token.symbol}`} />
                  <Row k="They receive" v={`≈ ${formatRawAmount(rescueQuote.outAmountRaw, 6)} USDC`} />
                  <Row k="Price impact" v={`${(rescueQuote.priceImpactPct * 100).toFixed(3)}%`} />
                  <Row k="Route" v={rescueQuote.routeLabels.join(' → ') || 'Jupiter'} />
                  <Row k="Max slippage" v={`${rescueQuote.slippageBps / 100}%`} />
                </div>
                <button className="btn btn-primary mt-auto" onClick={executeRescue}>
                  Swap & send USDC
                </button>
              </>
            )}
            {rescuePhase === 'swapping' && <Spinner label={`Swapping ${token.symbol} → USDC…`} />}
            {rescuePhase === 'sending' && <Spinner label="Swap confirmed. Sending USDC…" />}
            {rescuePhase === 'error' && (
              <>
                <ErrorNote text={rescueError} />
                <button className="btn btn-ghost mt-auto" onClick={() => setStep('compose')}>
                  Back
                </button>
              </>
            )}
          </>
        )}

        {/* ---------- STEP: result ---------- */}
        {step === 'result' && result && (
          <>
            <div className="m-auto flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">✅</div>
              <div className="text-sm font-bold">{result.title}</div>
              <div className="flex flex-col gap-2 w-full">
                {result.sigs.map((s) => (
                  <a
                    key={s.sig}
                    className="card !py-2 text-xs text-[#d9a441] hover:underline break-all"
                    href={`https://solscan.io/tx/${s.sig}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.label} ↗<div className="text-[10px] text-zinc-500 font-mono mt-0.5">{shortAddress(s.sig, 10)}</div>
                  </a>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={onBack}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-zinc-500">{k}</div>
      <div className={`text-xs text-right ${mono ? 'font-mono' : ''}`}>{v}</div>
    </div>
  );
}
