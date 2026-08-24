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
  // Mints below cross-verified against 5–7 exchanges' own listing data (see audit-coverage).
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': { symbol: 'TRUMP', name: 'Official Trump', decimals: 6, verified: true },
  '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv': { symbol: 'PENGU', name: 'Pudgy Penguins', decimals: 6, verified: true },
  pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn: { symbol: 'PUMP', name: 'Pump', decimals: 6, verified: true },
  '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump': { symbol: 'Fartcoin', name: 'Fartcoin', decimals: 6, verified: true },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium', decimals: 6, verified: true },
  KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS: { symbol: 'KMNO', name: 'Kamino', decimals: 6, verified: true },
  METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL: { symbol: 'MET', name: 'Meteora', decimals: 6, verified: true },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: 'JTO', name: 'Jito Governance', decimals: 9, verified: true },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: 'PYTH', name: 'Pyth Network', decimals: 6, verified: true },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: 'WIF', name: 'dogwifhat', decimals: 6, verified: true },
  '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ': { symbol: 'W', name: 'Wormhole', decimals: 6, verified: true },
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: { symbol: 'RENDER', name: 'Render', decimals: 8, verified: true },
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': { symbol: 'JLP', name: 'Jupiter Perps LP', decimals: 6, verified: true },
};

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDG_MINT = '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export interface UsdPrice {
  usd: number;
  change24hPct: number | null;
}

/** Stablecoins safe to value at $1.00 when the price API is unreachable. */
export const ONE_DOLLAR_STABLE_MINTS: ReadonlySet<string> = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', // USDG
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
  '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D', // jlUSDC (≈1, accrues slowly)
]);

export interface PricePoint {
  timestamp: number;
  price: number;
}

/** 24h price history (30-min candles) from the keyless DefiLlama coins API. Empty on failure. */
export async function fetchPriceHistory(mint: string, fetchImpl: typeof fetch = fetch): Promise<PricePoint[]> {
  try {
    const key = `solana:${mint}`;
    const res = await fetchImpl(`https://coins.llama.fi/chart/${encodeURIComponent(key)}?period=30m&span=48`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { coins?: Record<string, { prices?: Array<{ timestamp?: number; price?: number }> }> };
    const prices = body.coins?.[key]?.prices ?? [];
    return prices
      .filter((p) => typeof p?.timestamp === 'number' && typeof p?.price === 'number' && Number.isFinite(p.price))
      .map((p) => ({ timestamp: p.timestamp!, price: p.price! }));
  } catch {
    return [];
  }
}

const PRICE_HOSTS = ['https://lite-api.jup.ag', 'https://api.jup.ag'];

/**
 * Spot USD prices (and 24h change %) from the keyless Jupiter Price API v3,
 * trying both hosts (the lite host is intermittently flaky). Empty map only
 * when every host fails.
 */
export async function fetchUsdPrices(
  mints: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, UsdPrice>> {
  if (mints.length === 0) return {};
  const query = mints.map(encodeURIComponent).join(',');
  for (const host of PRICE_HOSTS) {
    try {
      const res = await fetchImpl(`${host}/price/v3?ids=${query}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
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
      if (Object.keys(out).length > 0) return out;
    } catch {
      continue;
    }
  }
  return {};
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
