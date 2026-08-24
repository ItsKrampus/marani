# Marani

**The Solana wallet that won't let you lose money.**

Born from a real loss: $750 of hackathon prize money (USDG) sent from a wallet to a Binance
deposit address — Binance doesn't list USDG, the funds never credited, and recovery meant a
support form, a 20 USDT fee, and a 30-day "best effort" wait.

Marani's send flow detects when you're about to send a token to a centralized exchange that
doesn't support it on Solana, blocks the mistake, and offers a one-tap rescue: swap to a
supported token (via Jupiter) and send that instead.

## Monorepo layout

- `apps/extension` — WXT + React browser-extension wallet (Manifest V3)
- `packages/core` — keys (BIP39 / SLIP-0010), vault encryption, balances, transfers (SPL + Token-2022), Jupiter swaps — built on `@solana/kit`
- `packages/preflight` — the safety engine: destination classification (CEX labels + sweep heuristic) and send-time rules over the exchange support matrix
- `scripts/refresh-data` — builders for `support-matrix.json` (live exchange APIs) and `labels.json`
- `docs/PLAN.md` — full research + build plan

## Quick start

```bash
pnpm install
pnpm refresh-data   # regenerate exchange support matrix from live APIs
pnpm dev            # run the extension in dev mode (Chrome)
pnpm build          # production build → apps/extension/.output/chrome-mv3
```

Load the built extension via `chrome://extensions` → Developer mode → Load unpacked.
