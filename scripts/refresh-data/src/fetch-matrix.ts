/**
 * Builds packages/preflight/data/support-matrix.json from live exchange APIs.
 *
 * Public (no key): Coinbase, KuCoin, Gate, Bitget, HTX, Binance (unofficial bapi fallback).
 * Keyed (read-only, optional env): BINANCE_API_KEY/BINANCE_API_SECRET → official sapi.
 * Kraken has no public per-network API → manual rows in kraken-manual.json.
 *
 * Run: pnpm refresh-data
 */
import { isSolanaAddress, USDG_MINT } from '@marani/core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type ExchangeId =
  | 'binance'
  | 'coinbase'
  | 'kraken'
  | 'kucoin'
  | 'gate'
  | 'bitget'
  | 'htx'
  | 'okx'
  | 'bybit'
  | 'mexc';

interface MatrixEntry {
  exchange: ExchangeId;
  mint: string;
  symbol: string;
  deposit: boolean;
  withdraw: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, '../../../packages/preflight/data/support-matrix.json');
const KRAKEN_MANUAL = join(here, 'kraken-manual.json');

// Optional read-only exchange API keys from repo-root .env (see .env.example).
try {
  process.loadEnvFile(join(here, '../../../.env'));
} catch {
  /* no .env — keyed exchanges are skipped */
}

const UA = { 'User-Agent': 'marani-refresh/0.1 (+https://github.com)' };

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function normSymbol(s: unknown): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9$._-]/g, '')
    .slice(0, 12);
}

function pushEntry(
  out: MatrixEntry[],
  exchange: ExchangeId,
  symbol: string,
  contract: unknown,
  deposit: boolean,
  withdraw: boolean,
) {
  const sym = normSymbol(symbol);
  const mint = typeof contract === 'string' ? contract.trim() : '';
  if (sym === 'SOL' && !mint) {
    out.push({ exchange, mint: 'SOL', symbol: 'SOL', deposit, withdraw });
    return;
  }
  if (!mint || !isSolanaAddress(mint)) return;
  out.push({ exchange, mint, symbol: sym, deposit, withdraw });
}

// ---------------- Coinbase ----------------
async function fetchCoinbase(): Promise<MatrixEntry[]> {
  const body = (await getJson('https://api.exchange.coinbase.com/currencies')) as Array<{
    id?: string;
    supported_networks?: Array<{ id?: string; name?: string; status?: string; contract_address?: string }>;
  }>;
  const out: MatrixEntry[] = [];
  for (const c of body ?? []) {
    for (const n of c.supported_networks ?? []) {
      const netId = String(n.id ?? n.name ?? '').toLowerCase();
      if (netId !== 'solana') continue;
      const online = String(n.status ?? '') === 'online';
      pushEntry(out, 'coinbase', c.id ?? '', n.contract_address, online, online);
    }
  }
  return out;
}

// ---------------- KuCoin ----------------
async function fetchKucoin(): Promise<MatrixEntry[]> {
  const body = (await getJson('https://api.kucoin.com/api/v3/currencies')) as {
    data?: Array<{
      currency?: string;
      chains?: Array<{
        chainName?: string;
        chainId?: string;
        isDepositEnabled?: boolean;
        isWithdrawEnabled?: boolean;
        contractAddress?: string;
      }>;
    }>;
  };
  const out: MatrixEntry[] = [];
  for (const c of body.data ?? []) {
    for (const ch of c.chains ?? []) {
      const isSol = String(ch.chainId ?? '').toLowerCase() === 'sol' || String(ch.chainName ?? '') === 'SOL';
      if (!isSol) continue;
      pushEntry(out, 'kucoin', c.currency ?? '', ch.contractAddress, ch.isDepositEnabled === true, ch.isWithdrawEnabled === true);
    }
  }
  return out;
}

// ---------------- Bitget ----------------
async function fetchBitget(): Promise<MatrixEntry[]> {
  const body = (await getJson('https://api.bitget.com/api/v2/spot/public/coins')) as {
    data?: Array<{
      coin?: string;
      chains?: Array<{ chain?: string; rechargeable?: string; withdrawable?: string; contractAddress?: string }>;
    }>;
  };
  const out: MatrixEntry[] = [];
  for (const c of body.data ?? []) {
    for (const ch of c.chains ?? []) {
      if (String(ch.chain ?? '').toUpperCase() !== 'SOL') continue;
      pushEntry(out, 'bitget', c.coin ?? '', ch.contractAddress, ch.rechargeable === 'true', ch.withdrawable === 'true');
    }
  }
  return out;
}

// ---------------- HTX ----------------
async function fetchHtx(): Promise<MatrixEntry[]> {
  const body = (await getJson('https://api.huobi.pro/v2/reference/currencies')) as {
    data?: Array<{
      currency?: string;
      chains?: Array<{
        chain?: string;
        displayName?: string;
        baseChain?: string;
        baseChainProtocol?: string;
        depositStatus?: string;
        withdrawStatus?: string;
        contractAddress?: string;
        ca?: string;
      }>;
    }>;
  };
  const out: MatrixEntry[] = [];
  for (const c of body.data ?? []) {
    for (const ch of c.chains ?? []) {
      const isSol =
        String(ch.baseChain ?? '').toUpperCase() === 'SOLANA' ||
        String(ch.baseChainProtocol ?? '').toUpperCase() === 'SPL' ||
        String(ch.displayName ?? '').toUpperCase() === 'SOL';
      if (!isSol) continue;
      pushEntry(
        out,
        'htx',
        c.currency ?? '',
        ch.contractAddress ?? ch.ca,
        String(ch.depositStatus ?? '') === 'allowed',
        String(ch.withdrawStatus ?? '') === 'allowed',
      );
    }
  }
  return out;
}

// ---------------- Gate ----------------
async function fetchGate(): Promise<MatrixEntry[]> {
  const body = (await getJson('https://api.gateio.ws/api/v4/spot/currencies')) as Array<{
    currency?: string;
    chain?: string;
    chains?: Array<{ name?: string; addr?: string; deposit_disabled?: boolean; withdraw_disabled?: boolean }>;
    deposit_disabled?: boolean;
    withdraw_disabled?: boolean;
  }>;
  const out: MatrixEntry[] = [];
  for (const c of body ?? []) {
    if (Array.isArray(c.chains)) {
      for (const ch of c.chains) {
        if (String(ch.name ?? '').toUpperCase() !== 'SOL') continue;
        pushEntry(out, 'gate', c.currency ?? '', ch.addr, ch.deposit_disabled !== true, ch.withdraw_disabled !== true);
      }
    } else if (String(c.chain ?? '').toUpperCase() === 'SOL') {
      // flat shape: one row per currency+chain, no contract address exposed → symbol-only, skip tokens
      if (normSymbol(c.currency) === 'SOL') {
        out.push({ exchange: 'gate', mint: 'SOL', symbol: 'SOL', deposit: c.deposit_disabled !== true, withdraw: c.withdraw_disabled !== true });
      }
    }
  }
  return out;
}

// ---------------- Binance ----------------
async function fetchBinanceBapi(): Promise<MatrixEntry[]> {
  const body = (await getJson('https://www.binance.com/bapi/capital/v2/public/capital/getNetworkCoinAll')) as {
    data?: Array<{
      coin?: string;
      networkList?: Array<{
        network?: string;
        depositEnable?: boolean;
        withdrawEnable?: boolean;
        contractAddress?: string;
      }>;
    }>;
  };
  const out: MatrixEntry[] = [];
  for (const c of body.data ?? []) {
    for (const n of c.networkList ?? []) {
      if (String(n.network ?? '').toUpperCase() !== 'SOL') continue;
      pushEntry(out, 'binance', c.coin ?? '', n.contractAddress, n.depositEnable === true, n.withdrawEnable === true);
    }
  }
  return out;
}

async function fetchBinanceSapi(): Promise<MatrixEntry[]> {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) throw new Error('no BINANCE_API_KEY/SECRET in env');
  const { createHmac } = await import('node:crypto');
  const qs = `timestamp=${Date.now()}&recvWindow=10000`;
  const sig = createHmac('sha256', secret).update(qs).digest('hex');
  const body = (await getJson(`https://api.binance.com/sapi/v1/capital/config/getall?${qs}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': key },
  })) as Array<{
    coin?: string;
    networkList?: Array<{ network?: string; depositEnable?: boolean; withdrawEnable?: boolean; contractAddress?: string }>;
  }>;
  const out: MatrixEntry[] = [];
  for (const c of body ?? []) {
    for (const n of c.networkList ?? []) {
      if (String(n.network ?? '').toUpperCase() !== 'SOL') continue;
      // official sapi has no contract address → symbol-only rows are unreliable; only keep native SOL
      pushEntry(out, 'binance', c.coin ?? '', n.contractAddress, n.depositEnable === true, n.withdrawEnable === true);
    }
  }
  return out;
}

// ---------------- Bybit (read-only key) ----------------
async function fetchBybit(): Promise<MatrixEntry[]> {
  const key = process.env.BYBIT_API_KEY;
  const secret = process.env.BYBIT_API_SECRET;
  if (!key || !secret) throw new Error('no BYBIT_API_KEY/SECRET in env');
  const { createHmac } = await import('node:crypto');
  const ts = Date.now().toString();
  const recv = '10000';
  const sign = createHmac('sha256', secret).update(ts + key + recv).digest('hex');
  const body = (await getJson('https://api.bybit.com/v5/asset/coin/query-info', {
    headers: { 'X-BAPI-API-KEY': key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': recv, 'X-BAPI-SIGN': sign },
  })) as {
    result?: {
      rows?: Array<{
        coin?: string;
        chains?: Array<{ chain?: string; chainDeposit?: string; chainWithdraw?: string; contractAddress?: string }>;
      }>;
    };
  };
  const out: MatrixEntry[] = [];
  for (const c of body.result?.rows ?? []) {
    for (const ch of c.chains ?? []) {
      if (String(ch.chain ?? '').toUpperCase() !== 'SOL') continue;
      pushEntry(out, 'bybit', c.coin ?? '', ch.contractAddress, ch.chainDeposit === '1', ch.chainWithdraw === '1');
    }
  }
  return out;
}

// ---------------- MEXC (read-only key) ----------------
async function fetchMexc(): Promise<MatrixEntry[]> {
  const key = process.env.MEXC_API_KEY;
  const secret = process.env.MEXC_API_SECRET;
  if (!key || !secret) throw new Error('no MEXC_API_KEY/SECRET in env');
  const { createHmac } = await import('node:crypto');
  const qs = `timestamp=${Date.now()}&recvWindow=10000`;
  const sig = createHmac('sha256', secret).update(qs).digest('hex');
  const body = (await getJson(`https://api.mexc.com/api/v3/capital/config/getall?${qs}&signature=${sig}`, {
    headers: { 'X-MEXC-APIKEY': key },
  })) as Array<{
    coin?: string;
    networkList?: Array<{
      netWork?: string;
      network?: string;
      depositEnable?: boolean;
      withdrawEnable?: boolean;
      contract?: string;
      contractAddress?: string;
    }>;
  }>;
  const out: MatrixEntry[] = [];
  for (const c of body ?? []) {
    for (const n of c.networkList ?? []) {
      const net = String(n.netWork ?? n.network ?? '').toUpperCase();
      if (!/^(SOL|SOLANA)/.test(net)) continue;
      pushEntry(out, 'mexc', c.coin ?? '', n.contract ?? n.contractAddress, n.depositEnable === true, n.withdrawEnable === true);
    }
  }
  return out;
}

// ---------------- OKX (read-only key; no contract addresses → consensus mints) ----------------
async function fetchOkx(consensusMintBySymbol: Map<string, string>): Promise<MatrixEntry[]> {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  if (!key || !secret || !passphrase) throw new Error('no OKX_API_KEY/SECRET/PASSPHRASE in env');
  const { createHmac } = await import('node:crypto');
  const ts = new Date().toISOString();
  const path = '/api/v5/asset/currencies';
  const sign = createHmac('sha256', secret).update(`${ts}GET${path}`).digest('base64');
  const body = (await getJson(`https://www.okx.com${path}`, {
    headers: {
      'OK-ACCESS-KEY': key,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
  })) as { data?: Array<{ ccy?: string; chain?: string; canDep?: boolean; canWd?: boolean; ctAddr?: string }> };
  const out: MatrixEntry[] = [];
  for (const c of body.data ?? []) {
    if (!/-solana$/i.test(String(c.chain ?? ''))) continue;
    const sym = normSymbol(c.ccy);
    // OKX omits mint addresses — adopt the mint only when every other exchange agrees on it.
    const mint = typeof c.ctAddr === 'string' && c.ctAddr ? c.ctAddr : consensusMintBySymbol.get(sym);
    pushEntry(out, 'okx', sym, mint, c.canDep === true, c.canWd === true);
  }
  return out;
}

// ---------------- Kraken (manual) ----------------
function fetchKrakenManual(): MatrixEntry[] {
  try {
    const rows = JSON.parse(readFileSync(KRAKEN_MANUAL, 'utf8')) as MatrixEntry[];
    return rows.filter((r) => r.exchange === 'kraken');
  } catch {
    return [];
  }
}

// ---------------- main ----------------
async function main() {
  const sources: Array<{ id: ExchangeId; name: string; run: () => Promise<MatrixEntry[]> | MatrixEntry[]; source: string }> = [
    { id: 'coinbase', name: 'Coinbase', run: fetchCoinbase, source: 'api.exchange.coinbase.com (public)' },
    { id: 'kucoin', name: 'KuCoin', run: fetchKucoin, source: 'api.kucoin.com (public)' },
    { id: 'bitget', name: 'Bitget', run: fetchBitget, source: 'api.bitget.com (public)' },
    { id: 'htx', name: 'HTX', run: fetchHtx, source: 'api.huobi.pro (public)' },
    { id: 'gate', name: 'Gate', run: fetchGate, source: 'api.gateio.ws (public)' },
    { id: 'kraken', name: 'Kraken', run: fetchKrakenManual, source: 'manual (no public network API)' },
  ];

  const entries: MatrixEntry[] = [];
  const exchanges: Record<string, { name: string; assets: number; source: string }> = {};

  // Binance: official sapi when keys are present, unofficial bapi otherwise.
  try {
    let binanceEntries: MatrixEntry[];
    let source: string;
    try {
      binanceEntries = await fetchBinanceSapi();
      source = 'api.binance.com sapi (read-only key)';
    } catch {
      binanceEntries = await fetchBinanceBapi();
      source = 'binance.com bapi (public, unofficial)';
    }
    entries.push(...binanceEntries);
    exchanges['binance'] = { name: 'Binance', assets: binanceEntries.length, source };
    console.log(`✓ Binance: ${binanceEntries.length} Solana assets (${source})`);
  } catch (e) {
    console.warn(`✗ Binance failed entirely: ${(e as Error).message}`);
  }

  for (const s of sources) {
    try {
      const rows = await s.run();
      entries.push(...rows);
      exchanges[s.id] = { name: s.name, assets: rows.length, source: s.source };
      console.log(`✓ ${s.name}: ${rows.length} Solana assets`);
    } catch (e) {
      console.warn(`✗ ${s.name} failed: ${(e as Error).message}`);
    }
  }

  // Keyed exchanges (optional): only run when read-only API keys are in .env.
  const consensus = new Map<string, string>();
  {
    const bySymbol = new Map<string, Set<string>>();
    for (const e of entries) {
      if (e.mint === 'SOL') continue;
      if (!bySymbol.has(e.symbol)) bySymbol.set(e.symbol, new Set());
      bySymbol.get(e.symbol)!.add(e.mint);
    }
    for (const [sym, mints] of bySymbol) if (mints.size === 1) consensus.set(sym, [...mints][0]!);
  }
  const keyed: Array<{ id: ExchangeId; name: string; run: () => Promise<MatrixEntry[]>; source: string }> = [
    { id: 'bybit', name: 'Bybit', run: fetchBybit, source: 'api.bybit.com (read-only key)' },
    { id: 'mexc', name: 'MEXC', run: fetchMexc, source: 'api.mexc.com (read-only key)' },
    { id: 'okx', name: 'OKX', run: () => fetchOkx(consensus), source: 'okx.com (read-only key, consensus mints)' },
  ];
  for (const s of keyed) {
    try {
      const rows = await s.run();
      entries.push(...rows);
      exchanges[s.id] = { name: s.name, assets: rows.length, source: s.source };
      console.log(`✓ ${s.name}: ${rows.length} Solana assets`);
    } catch (e) {
      console.log(`· ${s.name} skipped: ${(e as Error).message}`);
    }
  }

  const matrix = { updatedAt: new Date().toISOString(), exchanges, entries };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(matrix, null, 1));
  console.log(`\nWrote ${entries.length} entries → ${OUT_PATH}`);

  // Demo invariants (warn, don't fail): the founding story must be reproducible.
  const binanceHasUsdg = entries.some((e) => e.exchange === 'binance' && e.mint === USDG_MINT);
  const kucoinUsdg = entries.find((e) => e.exchange === 'kucoin' && e.mint === USDG_MINT);
  console.log(`\nDemo checks:`);
  console.log(`  Binance lists USDG: ${binanceHasUsdg ? '⚠️ YES (story changed!)' : '✓ no (block will fire)'}`);
  console.log(`  KuCoin USDG deposit enabled: ${kucoinUsdg?.deposit ? '✓ yes (control will pass)' : `⚠️ ${JSON.stringify(kucoinUsdg ?? null)}`}`);
}

await main();
