/**
 * Seeds packages/preflight/data/labels.json with known CEX Solana wallet addresses.
 *
 * Source 1: Dune Spellbook `cex_solana_addresses.sql` (community-curated).
 *   ⚠️ Spellbook is BUSL-1.1 licensed (converts to GPL-3.0+ on 2027-03-03).
 *   Used here for internal prototype/demo purposes only — replace with our own
 *   sweep-clustered dataset before any public/commercial launch.
 * Source 2: manual-labels.json (our own verified additions).
 */
import { isSolanaAddress } from '@marani/core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, '../../../packages/preflight/data/labels.json');
const MANUAL_PATH = join(here, 'manual-labels.json');

const SPELLBOOK_RAW =
  'https://raw.githubusercontent.com/duneanalytics/spellbook/main/dbt_subprojects/hourly_spellbook/models/_sector/cex/addresses/chains/solana/cex_solana_addresses.sql';

const KNOWN_EXCHANGES: Record<string, string> = {
  binance: 'binance',
  coinbase: 'coinbase',
  kraken: 'kraken',
  kucoin: 'kucoin',
  'gate.io': 'gate',
  gate: 'gate',
  bitget: 'bitget',
  htx: 'htx',
  huobi: 'htx',
  okx: 'okx',
  bybit: 'bybit',
  mexc: 'mexc',
};

interface LabelEntry {
  address: string;
  exchange: string;
  kind: 'hot' | 'deposit' | 'unknown';
  source: string;
}

async function fetchSpellbook(): Promise<LabelEntry[]> {
  const res = await fetch(SPELLBOOK_RAW);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching spellbook`);
  const sql = await res.text();
  const out: LabelEntry[] = [];
  // Rows look like: ('solana', '<base58 address>', 'Binance', 'Binance 1', ...).
  const rowRe = /\(\s*'solana'\s*,\s*'([1-9A-HJ-NP-Za-km-z]{32,44})'\s*,\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(sql)) !== null) {
    const [, addr = '', rawName = ''] = m;
    if (!isSolanaAddress(addr)) continue;
    const exchange = KNOWN_EXCHANGES[rawName.trim().toLowerCase()];
    if (!exchange) continue;
    out.push({ address: addr, exchange, kind: 'hot', source: 'dune-spellbook' });
  }
  return out;
}

function readManual(): LabelEntry[] {
  try {
    const rows = JSON.parse(readFileSync(MANUAL_PATH, 'utf8')) as LabelEntry[];
    return rows.filter((r) => isSolanaAddress(r.address) && r.exchange in { ...KNOWN_EXCHANGES, ...Object.fromEntries(Object.values(KNOWN_EXCHANGES).map((v) => [v, v])) });
  } catch {
    return [];
  }
}

async function main() {
  let spellbook: LabelEntry[] = [];
  try {
    spellbook = await fetchSpellbook();
    console.log(`✓ Dune Spellbook: ${spellbook.length} labeled CEX addresses`);
  } catch (e) {
    console.warn(`✗ Spellbook fetch failed: ${(e as Error).message}`);
  }
  const manual = readManual();
  if (manual.length) console.log(`✓ Manual labels: ${manual.length}`);

  const byAddress = new Map<string, LabelEntry>();
  for (const e of [...spellbook, ...manual]) byAddress.set(e.address, e); // manual wins
  const entries = [...byAddress.values()];

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.exchange, (counts.get(e.exchange) ?? 0) + 1);
  console.log('Per exchange:', Object.fromEntries([...counts.entries()].sort()));

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 1));
  console.log(`Wrote ${entries.length} labels → ${OUT_PATH}`);
}

await main();
