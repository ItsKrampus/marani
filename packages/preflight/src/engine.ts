import { USDC_MINT } from '@marani/core';
import {
  EXCHANGE_NAMES,
  type DestinationClass,
  type ExchangeId,
  type Finding,
  type LabelSet,
  type SendTokenContext,
  type SupportMatrix,
} from './types.js';

export interface MatrixIndex {
  matrix: SupportMatrix;
  byExchange: Map<ExchangeId, Map<string, { deposit: boolean; withdraw: boolean; symbol: string }>>;
}

export function indexMatrix(matrix: SupportMatrix): MatrixIndex {
  const byExchange = new Map<ExchangeId, Map<string, { deposit: boolean; withdraw: boolean; symbol: string }>>();
  for (const entry of matrix.entries) {
    let m = byExchange.get(entry.exchange);
    if (!m) {
      m = new Map();
      byExchange.set(entry.exchange, m);
    }
    m.set(entry.mint, { deposit: entry.deposit, withdraw: entry.withdraw, symbol: entry.symbol });
  }
  return { matrix, byExchange };
}

/** Classify a destination using the label DB plus user-confirmed marks. Sweep runs separately (async). */
export function classifyByLabels(
  destination: string,
  labels: LabelSet,
  userMarks: Record<string, ExchangeId | 'not-cex'>,
): DestinationClass | { kind: 'not-cex' } {
  const userMark = userMarks[destination];
  if (userMark === 'not-cex') return { kind: 'not-cex' };
  if (userMark) return { kind: 'cex', exchange: userMark, via: 'user' };
  const hit = labels.entries.find((l) => l.address === destination);
  if (hit) return { kind: 'cex', exchange: hit.exchange, via: 'label' };
  return { kind: 'unknown' };
}

/** Evaluate send-time safety rules for a CEX-bound transfer. */
export function evaluateCexSend(
  dest: Extract<DestinationClass, { kind: 'cex' }>,
  token: SendTokenContext,
  index: MatrixIndex,
): Finding[] {
  const findings: Finding[] = [];
  const exchangeName = EXCHANGE_NAMES[dest.exchange];
  const coverage = index.matrix.exchanges[dest.exchange];
  const table = index.byExchange.get(dest.exchange);

  if (!coverage || !table) {
    findings.push({
      level: 'warn',
      code: 'CEX_NO_DATA',
      title: `No listing data for ${exchangeName}`,
      detail: `This looks like a ${exchangeName} deposit address, but we have no support data for ${exchangeName}. Verify on their site that ${token.symbol} deposits on Solana are supported before sending.`,
    });
  } else {
    const key = token.mint ?? 'SOL';
    const row = table.get(key);
    if (!row) {
      const listedElsewhere = [...index.byExchange.entries()].filter(([, t]) => t.has(key)).length;
      const elsewhereNote =
        listedElsewhere === 0
          ? ` In fact, NONE of the ${index.byExchange.size} exchanges we track accept ${token.symbol} — there is no exchange this can be safely deposited to.`
          : ` (${listedElsewhere} other tracked exchange${listedElsewhere > 1 ? 's do' : ' does'} accept it.)`;
      findings.push({
        level: 'block',
        code: 'CEX_TOKEN_NOT_LISTED',
        title: `${exchangeName} does not support ${token.symbol} on Solana`,
        detail: `${exchangeName} has no Solana deposit support for ${token.symbol} (checked against ${exchangeName}'s own listing data, ${coverage.assets} Solana assets, updated ${index.matrix.updatedAt.slice(0, 10)}). If you send it, it will NOT be credited — recovery means a support ticket, a fee, and weeks of waiting, with no guarantee.${elsewhereNote}`,
        rescue: token.mint && token.mint !== USDC_MINT ? { suggestedMints: [USDC_MINT] } : undefined,
      });
    } else if (!row.deposit) {
      findings.push({
        level: 'block',
        code: 'CEX_DEPOSITS_SUSPENDED',
        title: `${exchangeName} has ${token.symbol} deposits suspended right now`,
        detail: `${exchangeName} lists ${token.symbol}, but Solana-network deposits are currently disabled. Sends made during a suspension can take days to credit or get stuck.`,
        rescue: token.mint && token.mint !== USDC_MINT ? { suggestedMints: [USDC_MINT] } : undefined,
      });
    } else {
      findings.push({
        level: 'ok',
        code: 'CEX_TOKEN_SUPPORTED',
        title: `${exchangeName} accepts ${token.symbol} on Solana`,
        detail: `${exchangeName} lists ${row.symbol} with Solana deposits enabled (data updated ${index.matrix.updatedAt.slice(0, 10)}).`,
      });
    }
  }

  return findings;
}

/** Token-2022 hazards apply to any destination, CEX or not. */
export function evaluateTokenHazards(token: SendTokenContext): Finding[] {
  const findings: Finding[] = [];
  if (token.program !== 'token-2022') return findings;
  if ((token.transferFeeBps ?? 0) > 0) {
    findings.push({
      level: 'warn',
      code: 'TOKEN2022_TRANSFER_FEE',
      title: `${token.symbol} charges a transfer fee`,
      detail: `This token takes ${(token.transferFeeBps ?? 0) / 100}% on every transfer — the recipient will receive less than you send, which can break exchange crediting.`,
    });
  }
  if (token.hasTransferHook) {
    findings.push({
      level: 'warn',
      code: 'TOKEN2022_TRANSFER_HOOK',
      title: `${token.symbol} has a transfer hook`,
      detail: 'A program runs on every transfer of this token. Some exchanges and wallets do not support hooked tokens.',
    });
  }
  return findings;
}

export function worstLevel(findings: Finding[]): 'block' | 'warn' | 'ok' {
  if (findings.some((f) => f.level === 'block')) return 'block';
  if (findings.some((f) => f.level === 'warn')) return 'warn';
  return 'ok';
}
