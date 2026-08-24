export type ExchangeId =
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

export const EXCHANGE_NAMES: Record<ExchangeId, string> = {
  binance: 'Binance',
  coinbase: 'Coinbase',
  kraken: 'Kraken',
  kucoin: 'KuCoin',
  gate: 'Gate',
  bitget: 'Bitget',
  htx: 'HTX',
  okx: 'OKX',
  bybit: 'Bybit',
  mexc: 'MEXC',
};

/** One (exchange, Solana mint) support row. */
export interface MatrixEntry {
  exchange: ExchangeId;
  /** Solana mint address, or the literal "SOL" for native SOL deposits. */
  mint: string;
  symbol: string;
  deposit: boolean;
  withdraw: boolean;
}

export interface SupportMatrix {
  updatedAt: string;
  /** Exchanges successfully ingested; a CEX absent here means "no data", not "nothing supported". */
  exchanges: Partial<Record<ExchangeId, { name: string; assets: number; source: string }>>;
  entries: MatrixEntry[];
}

export interface LabelEntry {
  address: string;
  exchange: ExchangeId;
  kind: 'hot' | 'deposit' | 'unknown';
  source: string;
}

export interface LabelSet {
  updatedAt: string;
  entries: LabelEntry[];
}

export type DestinationClass =
  | { kind: 'cex'; exchange: ExchangeId; via: 'label' | 'sweep' | 'user'; evidence?: string }
  | { kind: 'unknown' };

export type FindingLevel = 'block' | 'warn' | 'info' | 'ok';

export interface Finding {
  level: FindingLevel;
  code:
    | 'CEX_TOKEN_NOT_LISTED'
    | 'CEX_DEPOSITS_SUSPENDED'
    | 'CEX_TOKEN_SUPPORTED'
    | 'CEX_NO_DATA'
    | 'TOKEN2022_TRANSFER_FEE'
    | 'TOKEN2022_TRANSFER_HOOK'
    | 'TOKEN2022_PERMANENT_DELEGATE';
  title: string;
  detail: string;
  /** Set when the finding can be fixed by swapping to a supported token first. */
  rescue?: { suggestedMints: string[] };
}

export interface SendTokenContext {
  /** Mint being sent, or null for native SOL. */
  mint: string | null;
  symbol: string;
  program: 'token' | 'token-2022' | null;
  transferFeeBps?: number;
  hasTransferHook?: boolean;
  hasPermanentDelegate?: boolean;
}
