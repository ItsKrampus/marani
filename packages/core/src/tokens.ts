export interface TokenMeta {
  symbol: string;
  name: string;
  decimals?: number;
  verified?: boolean;
  logoUri?: string;
}

/** Static metadata for common mints so the UI never depends on the network for majors. */
export const WELL_KNOWN_TOKENS: Record<string, TokenMeta> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', decimals: 6, verified: true },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', decimals: 6, verified: true },
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH': {
    symbol: 'USDG',
    name: 'Global Dollar',
    decimals: 6,
    verified: true,
  },
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': { symbol: 'PYUSD', name: 'PayPal USD', decimals: 6, verified: true },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter', decimals: 6, verified: true },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk', decimals: 5, verified: true },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL', name: 'Marinade staked SOL', decimals: 9, verified: true },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'jitoSOL', name: 'Jito staked SOL', decimals: 9, verified: true },
  So11111111111111111111111111111111111111112: { symbol: 'wSOL', name: 'Wrapped SOL', decimals: 9, verified: true },
};

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDG_MINT = '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export interface UsdPrice {
  usd: number;
  change24hPct: number | null;
}

/** Spot USD prices (and 24h change %) from the keyless Jupiter Price API v3. Empty map on failure. */
export async function fetchUsdPrices(
  mints: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, UsdPrice>> {
  if (mints.length === 0) return {};
  try {
    const res = await fetchImpl(`https://lite-api.jup.ag/price/v3?ids=${mints.map(encodeURIComponent).join(',')}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const body = (await res.json()) as Record<string, { usdPrice?: number; priceChange24h?: number }>;
    const out: Record<string, UsdPrice> = {};
    for (const [mint, info] of Object.entries(body ?? {})) {
      if (typeof info?.usdPrice === 'number' && Number.isFinite(info.usdPrice)) {
        out[mint] = {
          usd: info.usdPrice,
          change24hPct: typeof info.priceChange24h === 'number' ? info.priceChange24h : null,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

const JUP_TOKEN_SEARCH = 'https://lite-api.jup.ag/tokens/v2/search?query=';

/** Resolve unknown mints via the (keyless) Jupiter Token API. Returns null on any failure. */
export async function fetchTokenMeta(
  mint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenMeta | null> {
  try {
    const res = await fetchImpl(JUP_TOKEN_SEARCH + encodeURIComponent(mint), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{
      id?: string;
      symbol?: string;
      name?: string;
      decimals?: number;
      isVerified?: boolean;
      icon?: string;
      logoURI?: string;
    }>;
    const hit = Array.isArray(list) ? list.find((t) => t.id === mint) : undefined;
    if (!hit || typeof hit.symbol !== 'string') return null;
    // On-chain metadata is untrusted input: cap lengths, strip control chars before display.
    const clean = (s: string, max: number) => s.replace(/[^\x20-\x7E]/g, '').slice(0, max);
    const iconRaw = hit.icon ?? hit.logoURI;
    const logoUri =
      typeof iconRaw === 'string' && iconRaw.startsWith('https://') && iconRaw.length <= 300 ? iconRaw : undefined;
    return {
      symbol: clean(hit.symbol, 12) || 'UNKNOWN',
      name: clean(hit.name ?? '', 32) || 'Unknown token',
      decimals: typeof hit.decimals === 'number' ? hit.decimals : undefined,
      verified: hit.isVerified === true,
      logoUri,
    };
  } catch {
    return null;
  }
}
