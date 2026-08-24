/**
 * Devnet end-to-end smoke test with throwaway in-memory keys (no user funds).
 * Exercises: cluster RPC pick → airdrop → balances → simulate → send →
 * confirmation → recipient balance → parsed activity.
 * Run: pnpm smoke:devnet
 */
import {
  explorerUrl,
  formatRawAmount,
  getParsedActivity,
  getPortfolio,
  makeRpc,
  newMnemonic,
  pickRpcUrl,
  requestDevnetAirdrop,
  sendTransfer,
  signerFromMnemonic,
  simulateTransfer,
  sleep,
} from '@marani/core';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

console.log('— devnet RPC pick —');
// DEVNET_RPC_URL lets the suite run against a local test validator (unlimited airdrops).
const url = process.env.DEVNET_RPC_URL?.trim() || (await pickRpcUrl(undefined, 'devnet'));
check('devnet endpoint picked', /devnet|127\.0\.0\.1|localhost/.test(url), url);
const rpc = makeRpc(url);

console.log('\n— throwaway wallets (SLIP-0010 path, same as the extension) —');
const sender = await signerFromMnemonic(process.env.DEVNET_MNEMONIC?.trim() || newMnemonic());
const recipient = await signerFromMnemonic(newMnemonic());
check('sender derived', sender.address.length >= 32, sender.address);
check('recipient derived', recipient.address !== sender.address, recipient.address);

console.log('\n— faucet —');
const retryWaitMs = Number(process.env.AIRDROP_WAIT_MS ?? 2500);
let funded = false;
// A pre-funded sender (e.g. airdropped from another IP) skips the faucet entirely.
try {
  const pre = await getPortfolio(rpc, sender.address);
  if (pre.lamports > 0n) {
    console.log(`✓ sender pre-funded with ${formatRawAmount(pre.lamports, 9)} SOL — skipping faucet`);
    funded = true;
  }
} catch {
  /* fall through to faucet */
}
if (!funded)
for (const amount of [1_000_000_000n, 500_000_000n, 200_000_000n]) {
  try {
    const res = await requestDevnetAirdrop(rpc, sender.address, amount);
    if (res.confirmed) {
      console.log(`✓ airdropped ${formatRawAmount(amount, 9)} SOL — ${explorerUrl('tx', res.signature, 'devnet')}`);
      funded = true;
      break;
    }
    console.log(`· airdrop ${formatRawAmount(amount, 9)} not confirmed, trying smaller`);
  } catch (e) {
    console.log(`· faucet refused ${formatRawAmount(amount, 9)}: ${(e as Error).message.slice(0, 90)}`);
  }
  console.log(`  waiting ${Math.round(retryWaitMs / 1000)}s before next attempt…`);
  await sleep(retryWaitMs);
}

if (funded) {
  console.log('\n— funded end-to-end —');
  const portfolio = await getPortfolio(rpc, sender.address);
  check('balance visible after airdrop', portfolio.lamports > 0n, `${formatRawAmount(portfolio.lamports, 9)} SOL`);

  const spec = {
    signer: sender,
    destination: recipient.address,
    amountRaw: 10_000_000n, // 0.01 SOL
    token: null,
  } as const;

  const sim = await simulateTransfer(rpc, spec);
  check('simulation passes', sim.ok, sim.ok ? `${sim.unitsConsumed} CU` : JSON.stringify(sim.err).slice(0, 120));

  const sent = await sendTransfer(rpc, spec);
  check('transfer confirmed', sent.confirmed, explorerUrl('tx', sent.signature, 'devnet'));

  const rec = await getPortfolio(rpc, recipient.address);
  check('recipient credited 0.01 SOL', rec.lamports === 10_000_000n, `${formatRawAmount(rec.lamports, 9)} SOL`);

  const { items } = await getParsedActivity(rpc, sender.address, { limit: 5 });
  const sentItem = items.find((i) => i.kind === 'sent' && i.deltas.some((d) => d.mint === null));
  check('activity parses the send', Boolean(sentItem), sentItem ? `${sentItem.deltas[0]?.delta} lamports` : 'not found');
} else {
  console.log('\n— faucet dry: degraded checks (pipeline still exercised) —');
  const sim = await simulateTransfer(rpc, {
    signer: sender,
    destination: recipient.address,
    amountRaw: 10_000_000n,
    token: null,
  });
  check(
    'unfunded simulation fails with a real chain error (pipeline works)',
    !sim.ok && sim.err != null,
    JSON.stringify(sim.err).slice(0, 100),
  );
  console.log('⚠ AIRDROP SKIPPED — public faucet rate-limited this IP; rerun later for the funded path.');
}

console.log(failures === 0 ? '\nDEVNET SMOKE PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
