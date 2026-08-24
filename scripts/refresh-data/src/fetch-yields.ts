/**
 * Builds packages/preflight/data/yields.json — live APY/TVL for Cellar venues,
 * from the public DefiLlama yields API. Run via `pnpm refresh-data`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, '../../../packages/preflight/data/yields.json');

interface LlamaPool {
  chain?: string;
  project?: string;
  symbol?: string;
  apy?: number;
  tvlUsd?: number;
  pool?: string;
}

interface Venue {
  apyPct: number;
  tvlUsd: number;
  source: string;
}

async function main() {
  const res = await fetch('https://yields.llama.fi/pools');
  if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
  const body = (await res.json()) as { data?: LlamaPool[] };
  const solana = (body.data ?? []).filter((p) => p.chain === 'Solana');

  const top = (project: RegExp, symbol: string): LlamaPool | undefined =>
    solana
      .filter((p) => project.test(p.project ?? '') && p.symbol === symbol)
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0];

  const pick = (p: LlamaPool | undefined): Venue | null =>
    p && typeof p.apy === 'number'
      ? { apyPct: Math.round(p.apy * 100) / 100, tvlUsd: Math.round(p.tvlUsd ?? 0), source: `defillama:${p.pool}` }
      : null;

  const venues = {
    jitosol: pick(top(/jito-liquid-staking/, 'JITOSOL')),
    msol: pick(top(/marinade-liquid-staking/, 'MSOL')),
    jupiterLendUsdc: pick(top(/jupiter-lend/, 'USDC')),
    kaminoLendUsdc: pick(top(/kamino-lend/, 'USDC')),
  };

  for (const [k, v] of Object.entries(venues)) {
    console.log(v ? `✓ ${k}: ${v.apyPct}% APY, $${(v.tvlUsd / 1e6).toFixed(0)}M TVL` : `✗ ${k}: not found`);
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), venues }, null, 1));
  console.log(`Wrote → ${OUT_PATH}`);
}

await main();
