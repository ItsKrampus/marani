/**
 * Coverage audit: cross-checks Solana's most-traded tokens against our
 * exchange support matrix and reports gaps. Run: npx tsx src/audit-coverage.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(readFileSync(join(here, '../../../packages/preflight/data/support-matrix.json'), 'utf8')) as {
  exchanges: Record<string, { name: string; assets: number }>;
  entries: Array<{ exchange: string; mint: string; symbol: string; deposit: boolean }>;
};

interface JupToken {
  id: string;
  symbol: string;
  name: string;
  decimals?: number;
}

const res = await fetch('https://lite-api.jup.ag/tokens/v2/toptraded/24h?limit=40');
const top = (await res.json()) as JupToken[];

const byMint = new Map<string, Map<string, boolean>>(); // mint -> exchange -> depositEnabled
for (const e of matrix.entries) {
  if (!byMint.has(e.mint)) byMint.set(e.mint, new Map());
  byMint.get(e.mint)!.set(e.exchange, e.deposit);
}

const exchanges = Object.keys(matrix.exchanges);
console.log(`Matrix: ${matrix.entries.length} entries | exchanges ingested: ${exchanges.join(', ')}`);
console.log(`\nTop-traded Solana tokens vs matrix (✓ deposit ok, ✗ listed but suspended, · no listing):\n`);
console.log('TOKEN'.padEnd(10), exchanges.map((e) => e.slice(0, 7).padEnd(8)).join(''));

let uncovered = 0;
for (const t of top) {
  const row = byMint.get(t.id);
  const cells = exchanges.map((ex) => {
    const v = row?.get(ex);
    return (v === true ? '✓' : v === false ? '✗' : '·').padEnd(8);
  });
  const anywhere = row && [...row.values()].some((v) => v);
  if (!anywhere) uncovered++;
  console.log(t.symbol.slice(0, 9).padEnd(10), cells.join(''), anywhere ? '' : '  ← no CEX coverage in matrix');
}
console.log(`\n${top.length - uncovered}/${top.length} top-traded tokens have at least one exchange entry.`);
console.log('\nVerified mints for curated lists (symbol,mint,decimals):');
for (const t of top.slice(0, 25)) console.log(`${t.symbol}\t${t.id}\t${t.decimals}`);
