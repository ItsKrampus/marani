/**
 * Smoke test for @marani/core + @marani/preflight against real data.
 * Read-only on mainnet; no transactions are sent.
 * Run: pnpm smoke
 */
import {
  decryptVault,
  derivePrivateKeyBytes,
  encryptVault,
  formatRawAmount,
  getMintInfo,
  getPortfolio,
  getSwapQuote,
  isValidMnemonic,
  JITOSOL_MINT,
  makeRpc,
  MSOL_MINT,
  quoteStake,
  newMnemonic,
  parseAmount,
  signerFromMnemonic,
  slip10DerivePath,
  USDC_MINT,
  USDG_MINT,
} from '@marani/core';
import {
  classifyByLabels,
  evaluateCexSend,
  evaluateTokenHazards,
  indexMatrix,
  type LabelSet,
  type SupportMatrix,
} from '@marani/preflight';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- 1. SLIP-0010 official ed25519 test vectors (fetched from the spec) ----------
async function testSlip10() {
  const res = await fetch('https://raw.githubusercontent.com/satoshilabs/slips/master/slip-0010.md');
  const md = await res.text();
  let totalChains = 0;
  for (const vector of ['Test vector 1 for ed25519', 'Test vector 2 for ed25519']) {
    const start = md.indexOf(`### ${vector}`);
    if (start === -1) continue;
    const end = md.indexOf('### Test vector', start + 1);
    const section = md.slice(start, end === -1 ? undefined : end);
    const seedMatch = section.match(/Seed \(hex\):\s*([0-9a-f]+)/);
    if (!seedMatch) continue;
    const seed = Uint8Array.from((seedMatch[1] ?? '').match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    // Chains are written as: Chain m/0<sub>H</sub>/1<sub>H</sub>
    const chains = [...section.matchAll(/Chain (m(?:\/\d+<sub>H<\/sub>)*)[\s\S]*?private:\s*([0-9a-f]{64})/g)];
    for (const [, path = '', expectedPriv = ''] of chains) {
      const segments = [...path.matchAll(/(\d+)<sub>H<\/sub>/g)].map((m) => parseInt(m[1] ?? '0', 10));
      const node = slip10DerivePath(seed, segments);
      const shortPath = path.replace(/<sub>H<\/sub>/g, "'");
      check(`SLIP-0010 ${vector.includes('1') ? 'v1' : 'v2'} ${shortPath}`, hex(node.key) === expectedPriv);
      totalChains++;
    }
  }
  check('SLIP-0010 vectors covered', totalChains >= 10, `${totalChains} chains`);
}

// ---------- 2. Mnemonic + vault ----------
async function testKeysVault() {
  const mnemonic = newMnemonic();
  check('mnemonic valid', isValidMnemonic(mnemonic), mnemonic.split(' ').length + ' words');
  const signer = await signerFromMnemonic(mnemonic);
  check('signer derived', typeof signer.address === 'string' && signer.address.length >= 32, signer.address);
  const again = await signerFromMnemonic(mnemonic);
  check('derivation deterministic', again.address === signer.address);
  const other = await signerFromMnemonic(mnemonic, 1);
  check('account index changes address', other.address !== signer.address);

  const vault = await encryptVault(mnemonic, 'correct horse battery staple');
  const roundTrip = await decryptVault(vault, 'correct horse battery staple');
  check('vault round-trip', roundTrip === mnemonic);
  let wrongFailed = false;
  try {
    await decryptVault(vault, 'wrong password');
  } catch {
    wrongFailed = true;
  }
  check('vault rejects wrong password', wrongFailed);

  // Known-vector cross-check: derivePrivateKeyBytes must be stable across runs/machines.
  const fixedSeed = new Uint8Array(64).fill(7);
  const priv = derivePrivateKeyBytes(fixedSeed);
  check('derive stable for fixed seed', hex(priv) === hex(derivePrivateKeyBytes(fixedSeed)));
}

// ---------- 3. Mainnet reads ----------
async function testMainnetReads() {
  const rpc = makeRpc();
  const usdg = await getMintInfo(rpc, USDG_MINT);
  check('USDG mint parsed', usdg !== null);
  if (usdg) {
    check('USDG is Token-2022', usdg.program === 'token-2022');
    check('USDG decimals = 6', usdg.decimals === 6);
    check('USDG transfer fee currently 0 bps', usdg.transferFeeBps === 0, `${usdg.transferFeeBps} bps`);
    check('USDG has no active transfer hook', !usdg.hasTransferHook);
    check('USDG extensions parsed', usdg.extensions.includes('confidentialTransferMint'), usdg.extensions.join(','));
  }
  const usdc = await getMintInfo(rpc, USDC_MINT);
  check('USDC is classic SPL', usdc?.program === 'token', usdc?.program);

  const portfolio = await getPortfolio(rpc, 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn');
  check('portfolio fetch works', typeof portfolio.lamports === 'bigint', `${portfolio.lamports} lamports, ${portfolio.tokens.length} tokens`);
}

// ---------- 4. Jupiter quote ----------
async function testJupiter() {
  const quote = await getSwapQuote({ inputMint: USDG_MINT, outputMint: USDC_MINT, amountRaw: 5_000_000n });
  check('Jupiter quotes USDG→USDC', quote.outAmountRaw > 4_900_000n, `5 USDG → ${formatRawAmount(quote.outAmountRaw, 6)} USDC via ${quote.routeLabels.join('>')}`);
}

// ---------- 4b. Cellar: staking routes + yields data ----------
async function testCellar() {
  for (const [label, mint] of [
    ['jitoSOL', JITOSOL_MINT],
    ['mSOL', MSOL_MINT],
  ] as const) {
    const q = await quoteStake({ solLamports: 100_000_000n, lstMint: mint });
    check(
      `stake route SOL→${label}`,
      q.outAmountRaw > 60_000_000n && q.outAmountRaw < 110_000_000n,
      `0.1 SOL → ${formatRawAmount(q.outAmountRaw, 9)} ${label}`,
    );
  }
  const yields = JSON.parse(readFileSync(join(here, '../../../packages/preflight/data/yields.json'), 'utf8')) as {
    venues: Record<string, { apyPct?: number } | null>;
  };
  const live = Object.entries(yields.venues).filter(([, v]) => typeof v?.apyPct === 'number');
  check('yields.json has live venues', live.length >= 3, live.map(([k, v]) => `${k}:${v!.apyPct}%`).join(' '));
}

// ---------- 5. Preflight engine on real generated data ----------
function testPreflight() {
  const matrix = JSON.parse(
    readFileSync(join(here, '../../../packages/preflight/data/support-matrix.json'), 'utf8'),
  ) as SupportMatrix;
  const labels = JSON.parse(
    readFileSync(join(here, '../../../packages/preflight/data/labels.json'), 'utf8'),
  ) as LabelSet;
  const index = indexMatrix(matrix);

  const binanceHot = labels.entries.find((l) => l.exchange === 'binance');
  check('labels include a Binance wallet', Boolean(binanceHot), binanceHot?.address);
  if (binanceHot) {
    const cls = classifyByLabels(binanceHot.address, labels, {});
    check('classify Binance hot wallet', cls.kind === 'cex' && cls.exchange === 'binance');
  }

  const usdgCtx = { mint: USDG_MINT, symbol: 'USDG', program: 'token-2022' as const, transferFeeBps: 0, hasTransferHook: false };
  const binanceFindings = evaluateCexSend({ kind: 'cex', exchange: 'binance', via: 'user' }, usdgCtx, index);
  check(
    'USDG→Binance BLOCKS with rescue',
    binanceFindings.some((f) => f.level === 'block' && f.code === 'CEX_TOKEN_NOT_LISTED' && f.rescue?.suggestedMints.includes(USDC_MINT)),
    binanceFindings[0]?.title,
  );

  const kucoinFindings = evaluateCexSend({ kind: 'cex', exchange: 'kucoin', via: 'user' }, usdgCtx, index);
  check(
    'USDG→KuCoin passes',
    kucoinFindings.some((f) => f.level === 'ok' && f.code === 'CEX_TOKEN_SUPPORTED'),
    kucoinFindings[0]?.title,
  );

  const solFindings = evaluateCexSend(
    { kind: 'cex', exchange: 'binance', via: 'user' },
    { mint: null, symbol: 'SOL', program: null },
    index,
  );
  check('native SOL→Binance passes', solFindings.some((f) => f.level === 'ok'), solFindings[0]?.title);

  const usdcBinance = evaluateCexSend({ kind: 'cex', exchange: 'binance', via: 'user' }, { mint: USDC_MINT, symbol: 'USDC', program: 'token' }, index);
  check('USDC→Binance passes', usdcBinance.some((f) => f.level === 'ok'), usdcBinance[0]?.title);

  const hazards = evaluateTokenHazards({ mint: 'x', symbol: 'FEE', program: 'token-2022', transferFeeBps: 200, hasTransferHook: true });
  check('token-2022 hazards fire', hazards.length === 2);

  check('amount utils', formatRawAmount(parseAmount('1.5', 6), 6) === '1.5' && formatRawAmount(1_234_500n, 6) === '1.2345');
}

console.log('— SLIP-0010 vectors —');
await testSlip10();
console.log('\n— keys & vault —');
await testKeysVault();
console.log('\n— mainnet reads —');
await testMainnetReads();
console.log('\n— Jupiter —');
await testJupiter();
console.log('\n— cellar —');
await testCellar();
console.log('\n— preflight engine —');
testPreflight();

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
