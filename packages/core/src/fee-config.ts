/**
 * Marani revenue switch — Jupiter integrator fees on swaps.
 *
 * OFF by default (feeBps = 0): users pay nothing to Marani today.
 *
 * To turn on:
 *   1. Go to https://referral.jup.ag, connect the treasury wallet, create a
 *      referral account, and create fee token accounts for each output mint
 *      you want to collect in (USDC, USDG, SOL/wSOL, jitoSOL, mSOL, JUP).
 *   2. Paste each fee token account below and set feeBps.
 *
 * Mechanics: the fee is charged in the swap's OUTPUT token, deposited to the
 * matching fee token account. Benchmarks: Phantom 0.85% (85 bps) in-app swap
 * fee → ~$326M gross in FY2025; MetaMask 0.875%. Jupiter keeps a 20% cut of
 * integrator fees. Swaps to mints not listed here simply charge no fee.
 */
export interface SwapFeeConfig {
  /** Fee in basis points (85 = 0.85%). 0 disables fees entirely. */
  feeBps: number;
  /** Output mint → Marani fee token account (from the Jupiter referral dashboard). */
  feeAccountByOutputMint: Record<string, string>;
}

export const SWAP_FEE_CONFIG: SwapFeeConfig = {
  feeBps: 0,
  feeAccountByOutputMint: {
    // 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': '<referral USDC token account>',
  },
};

/** Returns the fee parameters for a given output mint, or null when fees are off/unconfigured. */
export function feeParamsFor(outputMint: string): { platformFeeBps: number; feeAccount: string } | null {
  if (SWAP_FEE_CONFIG.feeBps <= 0) return null;
  const feeAccount = SWAP_FEE_CONFIG.feeAccountByOutputMint[outputMint];
  return feeAccount ? { platformFeeBps: SWAP_FEE_CONFIG.feeBps, feeAccount } : null;
}
