# Plan: Safety-first Solana wallet for Startup Village (Superteam Georgia)

## Context

The founder won $750 at a Superteam Georgia hackathon, paid in USDG (Paxos Global Dollar). They sent it from Phantom to their Binance deposit address; the transfer succeeded on-chain (visible on Solscan) but Binance never credited it because Binance doesn't list USDG. Recovery required a support form and a ~$20 fee with no guarantee. The startup idea: a Solana wallet whose send flow detects "you're about to send a token to an exchange that doesn't support it" and offers to swap to a supported token (e.g., USDC via Jupiter) before sending. On top: an in-wallet yield/staking section, and possibly private transfers.

Goal of this plan: research-validate and sharpen the idea, then lay out a concrete build plan for a working MVP demo at Startup Village.

## User constraints (confirmed)

- **Timing:** Startup Village is running NOW (Aug 22–31, 2026, Ambassadori Kachreti — confirmed on the official page). User is executing during it and expects the core build in **~3–4 AI-assisted days**, demo-ready well before Aug 31. The "1–2 months" answer = post-village runway for hardening/traction.
- **Deliverable:** working MVP demo (not just a deck). The village format is a build residency with mentor/investor office hours — a live product + the origin story is the winning combo.
- **Platform:** browser extension wallet (Phantom-style), chosen deliberately.
- **Team:** solo builder + Claude Code → lean hard on public APIs, bundled datasets, and Jupiter's hosted swap infra; avoid anything requiring ops babysitting.

## Research findings

### Track A — Competition & prior art (complete)

**Verdict: the check is partially proven, and the proposed product is unbuilt.**
- **Rabby (EVM wallet by DeBank) is the only product that ships it** — verified in its open-source security engine: Rule 1020 *"recipient address is a deposit address on a CEX that does not support the current token"* (danger-level, disables the token in the send UI). But: EVM-only (Solana was on a Q4-2025 roadmap, never shipped), closed first-party DeBank labeling data, listing-proxy not per-network deposit flags, **warn/block only — no swap remediation**, and so under-marketed most Rabby reviews don't mention it.
- **No Solana wallet does anything like it**: Phantom (first-time-recipient + simulation warnings only; its help center's answer to "sent tokens to an exchange, not arrived" is manual triage; no address-poisoning detection — criticized after a $264K loss, Feb 2026), Solflare (Guards simulation; its own guide tells users to check exchange support manually), Backpack (Blockaid-powered generic scam detection), Jupiter Mobile (drainer warnings only). All four have built-in swaps — the remediation rails exist, unused.
- **No security API sells the check**: Blockaid (dominant; risk/OFAC/poisoning only), Webacy, Kerberus/Sentinel3 (absorbed Pocket Universe, Aug 2025), Harpie (dead, Mar 2025), Blowfish (acquired by Phantom Nov 2024, sunset for third parties — a B2B vacuum). Labeling vendors (BlockSec MetaSleuth, Arkham) sell deposit-address *labels* incl. Solana, but nobody maps token→exchange deposit support.
- **Coinbase's help center literally claims it's impossible** ("other exchanges or wallets can't verify if Coinbase supports a specific crypto") — Rabby disproves this; great pitch slide.
- **Problem validation at scale**: Coinbase's self-service recovery tool returned **$160M+ to 10,000+ users in ~14 months** (extended to Solana SPL tokens Apr 2025); Binance's current schedule for exactly our case (unlisted token, supported network) = **20 USDT fee, 30 working days, explicitly best-effort** — matches the founder's story to the dollar. Bybit rejects recoveries under $500. Mesh raised **$82M Series B (Paradigm, Mar 2025)** solving wrong-deposits B2B — validates the problem; not a consumer wallet. Map3.xyz (YC W23 deposit-compatibility SDK) died — standalone infra without distribution fails; wallet-embedded is the right wrapper.
- **No hackathon prior art found** (ETHGlobal, Colosseum public archives, Superteam Earn, GitHub, npm). Nearest precedents: Xaman enforcing XRPL destination tags; Utila's verified exchange addresses (institutions, address-integrity only).
- **Market pattern**: Solana wallet space is crowded and consolidating (Phantom $3B valuation/20M users; Axiom $300M revenue in 263 days; many exits/deaths). Winners own order-flow monetization + a sharp wedge. "Monetized safety" is emerging (MetaMask Transaction Shield, $9.99/mo). Generic wallet = dead; safety wedge + swap monetization fits the winning pattern.
- **Honest risks for the pitch**: it's a feature Phantom could fast-follow (answer: dataset moat, data freshness, B2B API optionality, speed — Rabby's 2-year-old EVM feature still hasn't reached Solana); exchange-API ToS on redistribution needs counsel eventually; never guarantee — always "warn."

### Live checks run from this machine (2026-08-24)

- **USDG mint `2u1t…jGWH` is Token-2022** (owner `TokenzQd…`), with extensions: transferFee (currently 0 bps), permanentDelegate, transferHook (unset), **confidentialTransferMint (present, auto-approve off)**, metadata. → The wallet MUST support Token-2022 transfers for the core demo; also warn-worthy metadata for the preflight engine; and USDG itself carries the confidential-transfer extension — nice tie-in for the privacy roadmap.
- **Jupiter routes USDG→USDC keyless today**: `lite-api.jup.ag/swap/v1/quote` returned 100 USDG → 100.0088 USDC, ~0% price impact (route: Manifest → AlphaQ via PYUSD). The v2 `/order` path on lite-api returned "Route not found" — implementation will use the documented v2 host with an API key, with v1 quote+swap as proven fallback.
- KuCoin lists USDG with `isDepositEnabled: true` on SOL (public API, verified by research agent) → perfect positive control for the demo: same token, KuCoin = fine, Binance = blocked.

### Track B — Technical feasibility (complete; APIs live-probed 2026-08-24)

**Verdict: feasible.** The "does exchange X accept token Y on Solana?" half is easy; the "is this address exchange X?" half needs a layered approach.

**Exchange deposit-support data (the core dataset):**
- Fully public, no key (verified live): **Coinbase** (`/currencies`), **KuCoin** (`/api/v3/currencies`), **Gate** (`/api/v4/wallet/currency_chains`), **Bitget** (`/api/v2/spot/public/coins`), **HTX** (`/v2/reference/currencies`). All expose per-network deposit-enabled flags.
- Basic read-only API key, server-side: **Binance** (`/sapi/v1/capital/config/getall`), **OKX**, **Bybit**, **MEXC**. (Binance also has an undocumented public `bapi` endpoint with mint addresses — fallback only.)
- **Kraken**: no public network data → small manually-maintained table.
- **7/10 return the Solana mint address** → match on `(exchange, chain=Solana, mint)`, never symbol-only. Proven pitfall: Coinbase's "JUP" is an unrelated delisted Ethereum token — symbol matching would give wrong answers.
- Aggregators (CoinGecko/CMC) not needed: tickers = traded pairs ≠ deposit networks/status.
- Refresh ~hourly; deposit flags flip during incidents (that itself is a warnable event even for listed tokens).

**Destination-is-a-CEX detection (3-state: known-CEX / unknown / known-not-CEX):**
1. Seed label DB: Dune Spellbook `cex_solana.addresses` (166 addrs, 27 exchanges; ⚠️ BUSL-1.1 license until Mar 2027 — needs care/permission; becomes GPL after) + CMC free `/v1/exchange/assets` (exchanges' self-disclosed reserve wallets) + own curation (verified deposit flows).
2. **Sweep heuristic**: CEX deposit addresses hold ~0 SOL, get swept to hot wallets with an exchange wallet paying the fee. Check last 25–50 txs via Helius Enhanced Transactions API (free tier 1M credits/mo) for outbound transfers to labeled hot wallets; each hit transitively grows the label DB (this dataset becomes the moat). Unavoidable failure mode: fresh deposit addresses have zero history.
3. UX fallback when unknown: "Is this an exchange deposit address?" + exchange picker; remember per address-book entry. No wallet automates any of this today (per prior-art check: Phantom's help docs just *tell* users to verify manually).
- SPL nuance: tokens land in ATAs — check the mint-specific ATA history too. Also read mint's owner program: warn extra on Token-2022 mints with transfer-fee/hook extensions.

**Wallet build (browser extension, solo dev):**
- **Do NOT fork Backpack** (dormant since Aug 2024, GPL-3.0) or Espresso Cash (no license). Build fresh on **`@solana/kit` 8.0** (MIT, active, Aug 2026 release) + **Wallet Standard** (`@wallet-standard/*`) so dApps auto-discover the extension as a real wallet.
- Key management: classic BIP39 seed phrase (`@scure/bip39` + ed25519 derivation `m/44'/501'/0'/0'`), encrypted with password-derived key in extension storage — the Phantom pattern; simplest and most credible in an extension. (Privy/Dynamic embedded SDKs are web/mobile-first — keep for a later web companion, not the extension MVP.)
- Extension scaffold: Manifest V3 + WXT (actively maintained) or CRXJS + React; content script injects the Wallet Standard provider.

**Swap leg — Jupiter Swap API v2 (unified Ultra+Metis, Aug 2026):**
- Meta-Aggregator path: `GET /order` + `POST /execute` — Jupiter returns the built transaction, handles slippage/priority fees/landing; **no own RPC needed**. Free keyless tier (`lite-api.jup.ag`) for dev; API key from the Jupiter portal.
- **Monetization built in:** pass `referralAccount` + `referralFee` (50–255 bps allowed; Jupiter keeps 20% of it). Set up via `@jup-ag/referral-sdk`. E.g., 85 bps on rescue-swaps ≈ Phantom's 0.85%.
- Jupiter Token API v2 (`isVerified`, tags) for mint verification cross-check.

### Track D — Market, USDG, event context (complete)

**The problem is quantifiably real (pitch ammunition):**
- Binance processes **~4,000 deposit-recovery applications/month, restoring ~7M USDT/month** (~$84M/yr, one exchange) — Binance's own Square post.
- Coinbase director Conor Grogan: **913k ETH ≈ $3.4B** permanently lost to user error on Ethereum alone (July 2025 update).
- Recovery is a paid support industry: Binance tiered fees (historically 0.001 BTC ≈ $20 → raised to 500 BUSD for wrong-network; now tiered 5 BUSD self-service → 200–500 BUSD; newer posts cite 50 USDT → 5% of value), Coinbase self-service tool: free under $100 then **5% fee**, Kraken **$200–500**, Bybit **$200** or 5× withdrawal fee, KuCoin **40–500 USDT**. Recovery never guaranteed, 2–30 days.
- No wallet prevents this today (pending Track A confirmation).

**USDG validates the origin story:** $3.39B market cap (Aug 2026, ~12x in 12 months), issued by Paxos (MAS-regulated; MiCA in EU), live on Solana since Feb 2025 (mint `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH`). **Confirmed NOT listed on Binance or Coinbase** (competitor stablecoins); listed on Kraken, OKX, Bybit, Gemini, KuCoin, Gate, Upbit, Bithumb. Superteam paying prizes in USDG is an established Global Dollar Network incentive pattern (Solana Foundation's StableHacks 2026 also paid in USDG). → The exact failure (USDG→Binance) remains reproducible today.
- **Monetization lane unique to us:** Global Dollar Network membership — partners holding/accepting USDG earn a share of Paxos reserve yield (100+ partners incl. wallets/infra). A safety wallet born from a USDG incident joining GDN is a great story and a 4th revenue stream.

**Wallet monetization benchmarks (business-model slide):** Phantom: 0.85% in-app swap fee → **$325.9M gross revenue FY2025**, $17M in April 2025 alone, ~17M MAU; perps builder fee 0.05% on Hyperliquid. MetaMask: 0.875% swap fee; 15% commission on staking rewards. Standard pattern: swap bps + 10–15% of yield + perps bps + on-ramp spread.

**Startup Village (resolved):** official page confirms the 2026 edition is a **9-day residential build program, Aug 22–31, 2026** at Ambassadori Kachreti (20 builders, "ship the thing you've been putting off"; mentor/investor office hours; no published prize/demo-day structure). User is executing during it now. Format is a **build residency, not a pitch competition** — shipping live beats a deck.
- Superteam Georgia context: young chapter (est. late 2025), 128 members, Solana Foundation Georgia grants up to $10k equity-free (a concrete funding target after the event), Bank of Georgia relationship, announced GELT (lari stablecoin).

### Track C — Yield + privacy (complete)

**Yield is table stakes, not a differentiator.** Phantom (Earn → Kamino + Drift vaults, own PSOL LST, perps via Hyperliquid), Solflare (Earn via Lulo), Jupiter Mobile (Jupiter Lend, $439M USDC pool at ~4.9%), Backpack all ship it. We should still include it (users expect it), but framed through safety: curated venues, clear risk labels, Lulo-"Protected"-style coverage.
- Best integration paths for a solo dev: **Lulo API** (stablecoin aggregator; powers Solflare; 50+ B2B integrations; supports USDC/USDT/PYUSD **and USDG** — poetic given the origin story), **Jupiter Lend API** (largest USDC pool), **Marinade SDK** for SOL staking (documented referral: +12.5 bps extra APY to both partner and staker), later a **Sanctum branded LST** (what Phantom/Jupiter did; partner takes ~2.5% of staking yield).
- US note: GENIUS Act (July 2025) bans *issuer-paid* stablecoin yield; OCC rulemaking pending. Market as "DeFi lending yield," never "interest."

**Privacy: rebrand "anonymous transfers" → "confidential transfers." Do not build a mixer.**
- **Ship:** Token-2022 **Confidential Balances** UI — hides amounts/balances (not sender/receiver), supports compliance auditor keys. Re-enabled on Solana mainnet ~June 2026 after 5 audits (was disabled June 2025 for a ZK proof bug). **No consumer wallet has native UI for it yet** (Helius names Phantom/Backpack only as "potential adopters") → genuinely open differentiator that fits the safety-first brand. Caveat: works only on Token-2022 mints with the extension enabled (e.g., PYUSD; not plain USDC); market it as "confidential," never "anonymous."
- **Do not ship:** pool-based anonymity (shielded pools, rings, relayers). Roman Storm was convicted Aug 2025 for exactly this fact pattern (unlicensed money transmitting; DOJ sought Oct 2026 retrial on remaining counts); FinCEN's mixing rule is pending; EU AMLR bans anonymizing instruments at regulated entities from 2027; mixed funds get frozen at exchanges. Tornado Cash's OFAC delisting was about authority over immutable code, not a blessing.
- Middle ground later: deep-link to screened third-party pools (Privacy Cash, 0xbow-style association sets) rather than embedding; watch Arcium C-SPL and Helius Privacy Protocol (both immature/gated as of Aug 2026).
- Low-risk privacy adjacents: balance-hide UX, own RPC (no IP-to-address leakage), viewing-key export.

## Recommended product shape

**Positioning: "The wallet that won't let you lose money."** A safety-first Solana wallet whose wedge is the **CEX deposit preflight + one-tap rescue swap** — detection proven only by Rabby on EVM, remediation built by nobody. Everything else (yield, privacy) is framed through the same safety brand.

**Sharpen the original idea in four ways:**
1. **Drop "checks DEXes."** DEXes aren't deposit destinations — you connect a wallet, funds never strand. The check is CEX-only; that keeps the data problem tractable (10 exchanges ≈ 95% of the risk).
2. **The swap remediation is the product, not the warning.** Warning = safety; "Swap to USDC and send anyway" in one tap = the aha moment AND the revenue (swap-fee bps, Phantom-proven at ~$326M/yr scale). Preflight becomes a rules engine over time (poisoning lookalikes, Token-2022 fee/hook warnings, deposits-suspended alerts, first-time recipient) → later licensable as a B2B API into the vacuum Blowfish's death left.
3. **Yield ships, but curated & safety-framed** (it's table stakes): Lulo (supports USDG!) / Jupiter Lend for stables, Marinade for SOL (partner referral: +12.5 bps to us AND the user). Read-only rates at MVP, deposits post-village. Never market as "interest" (GENIUS Act).
4. **"Anonymous transfers" → "Confidential transfers."** No mixer, ever (Storm conviction, FinCEN pending rule, EU 2027 ban). Instead: first consumer wallet UI for Token-2022 Confidential Balances (amounts hidden, auditor-key compliant, re-enabled on mainnet ~June 2026, zero wallet competition). Roadmap item, not MVP — but a killer differentiator slide, and USDG itself carries the extension.

**Moat story (for "Phantom will copy you"):** the defensible asset is the **Solana deposit-address label graph + hourly-fresh exchange support matrix** — grown transitively by the sweep heuristic every time any user sends. Plus: Rabby's feature has existed 2+ years on EVM and still hasn't reached Solana; speed and focus win the window. Exit optionality: Phantom acquired 4 safety/infra companies in 16 months.

**Name candidates** (user picks later, not blocking): **Marani** (მარანი — Georgian wine cellar, "where you keep what's precious"; born in Kakheti wine country — perfect founding story) or **Preflight** (descriptive, B2B-friendly).

**The demo (3 beats, ~90 seconds):**
1. *Story*: the real Solscan tx of the lost $750 USDG → Binance, and Binance's "20 USDT, 30 working days, best-effort" policy.
2. *Live save*: paste a real Binance Solana deposit address → wallet flags "Binance deposit address — Binance does not support USDG on Solana" → tap **"Swap to USDC & send"** → Jupiter executes, USDC lands, Binance credits it live.
3. *Control*: same USDG to a KuCoin address → green check (KuCoin supports it, verified via public API). Proves it's real data, not a hardcoded demo.

## Build plan

### Architecture (monorepo `marani/`, pnpm workspaces, all TypeScript)

```
apps/extension/        WXT + React + Manifest V3 extension
packages/preflight/    rules engine + datasets (pure TS, no deps on extension)
packages/core/         keys, tx building on @solana/kit v8 + @solana-program/token-2022
scripts/refresh-data/  exchange-matrix + labels builders (Node, runs locally; NEVER ships keys)
```

- **Keys:** BIP39 (`@scure/bip39`) → ed25519 `m/44'/501'/0'/0'` → encrypt with WebCrypto (PBKDF2 + AES-GCM, password unlock) → `chrome.storage.local`. Classic Phantom pattern; no embedded-SDK dependency.
- **Chain access:** Helius free tier (1M credits/mo): DAS `getAssetsByOwner` for balances; enhanced tx API + `getSignaturesForAddress` for the sweep heuristic. Public mainnet RPC as fallback.
- **Send path:** detect mint owner program (Tokenkeg vs TokenzQd) → `transferChecked` accordingly; create recipient ATA if missing. **Token-2022 support is non-negotiable (USDG is Token-2022 — verified).**
- **Preflight engine (3-state destination + rules):**
  - `support-matrix.json` (bundled, regenerated by script): Coinbase/KuCoin/Gate/Bitget/HTX (public, no keys) + Binance (user's read-only key locally, unofficial `bapi` as fallback) + OKX/Bybit/MEXC (read-only keys, post-MVP ok) + manual Kraken rows. Normalized `(exchange, mint, depositEnabled, updatedAt)`; **match by mint, never symbol** (Coinbase's "JUP" trap).
  - `labels.json`: Dune Spellbook cex_solana seed (166 addrs; base58-validate; internal/demo use given BUSL — replace with own data post-village) + user's own real Binance deposit address + hot wallets confirmed by us.
  - Sweep heuristic: destination's recent txs show full-balance outbound to labeled hot wallet with foreign fee-payer → classify as that CEX; unknown → in-flow prompt "Is this an exchange deposit address?" (picker), remembered per contact.
  - Rules for MVP: R1 destination-is-CEX, R2 token-unsupported → danger + rescue CTA, R3 deposits-suspended → warn, R4 Token-2022 transfer-fee/hook caution (free — we already read the mint).
- **Rescue swap:** Jupiter Swap API v2 `/order`+`/execute` (portal API key; lite-api v1 quote+swap as proven fallback) → then auto-send USDC. Referral fee (50–255 bps) deferred to post-village (needs referral-account setup; keep demo latency-clean).
- **Wallet Standard provider injection** so dApps discover it as a real wallet — stretch, high demo value.

### Sprint (village days; user expects core in ~3–4 days, hard stop Aug 31)

- **Day 1 — a wallet that works:** scaffold (WXT+React+kit), onboarding/unlock, balances via DAS, send SOL + SPL + **Token-2022** on mainnet with tiny real amounts. Riskiest plumbing first.
- **Day 2 — the brain:** refresh-data script → support-matrix (5 public exchanges + Binance + manual Kraken; assert USDG: Binance ✗ / KuCoin ✓ / Kraken ✓), labels seed, preflight R1–R3 wired into the send flow (3-state UI + exchange picker fallback).
- **Day 3 — the magic + the moat:** rescue swap end-to-end (order→execute→auto-send), sweep-heuristic classifier via Helius, full rehearsal of the USDG→Binance save with real funds; record a backup video of the whole flow.
- **Day 4 — credibility:** R4 warnings, activity view, empty/error states, visual polish; Wallet Standard injection if time; landing one-pager + pitch talking points from the research stats; live dry-run for a mentor.
- **Days 5–7 (buffer/stretch, to Aug 31):** yield tab read-only (Lulo + Jupiter Lend rates, "deposits coming soon"), confidential-transfers roadmap slide, iterate on mentor/investor feedback at the village, demo to Superteam leads.

### Post-village roadmap (the real "1–2 months")

Hosted support-matrix API w/ hourly refresh + deposit-flag-flip alerts; own label clustering (drop Dune dependency); Jupiter referral fee live (~85 bps on rescue swaps); Lulo + Marinade deposits; Confidential Balances UI (PYUSD first); mobile via Mobile Wallet Adapter; B2B preflight-API pilot (pitch to Solflare/Backpack — Blowfish vacuum); **apply: Solana Foundation Georgia grant (up to $10k equity-free), Colosseum, GDN membership conversation via Superteam/Paxos**.

### Pitch kit (numbers all sourced in research above)

- Problem: Binance ~4,000 recoveries/mo (~$84M/yr restored, one exchange); Coinbase tool returned $160M+/14mo; fees $20–$500, 30 days, never guaranteed; $3.4B ETH lost to user error; founder's own $750 story.
- Why now: USDG-class new stablecoins ($3.4B, 12x/yr, still not on Binance/Coinbase) make unsupported-deposit collisions MORE common; Rabby proved the check, nobody built the fix; Blowfish's death left the B2B lane empty.
- Business model: swap bps (Phantom: 0.85% → $326M FY2025), 10–15% of yield, B2B preflight API, GDN reserve-share on USDG balances.
- Honest risks: fast-follow (moat = dataset + freshness + focus), data-ToS counsel needed, "warn, never guarantee" liability language.

## Verification

1. **Dataset truth:** refresh script asserts from live APIs — USDG depositEnabled: Binance absent/✗, KuCoin ✓ (SOL chain), Kraken ✓ (manual row); JUP mint matches `JUPy…DvCN` across ≥3 exchanges (symbol-collision guard works: Coinbase "JUP" excluded by mint match).
2. **E2E on mainnet with small real funds (~$20–30 total):** (a) start a USDG send to the user's real Binance Solana deposit address → the danger warning fires and blocks (we never actually send USDG to Binance again); (b) rescue path: accept the suggestion — swap ~$10 USDG→USDC via Jupiter, auto-send to the same Binance address, confirm the credit appears in the Binance account; (c) control: USDG to a KuCoin deposit address → green check, credits fine; (d) fresh unknown address → fallback "is this an exchange?" prompt appears; (e) plain sends of SOL + USDC + USDG (Token-2022) between own wallets all land.
3. **Wallet basics:** create → lock → unlock → import-from-seed round-trip restores the same address; balances match Solscan.
4. **Demo insurance:** recorded video of the full happy path before demo day; extension loads from a clean Chrome profile.

## Open flags (carried from research)

Dune Spellbook BUSL license (demo-internal only; moot Mar 2027); exchange API ToS on redistribution (counsel before B2B); Bybit USDG status conflicting; Jupiter v2-on-lite-api quirk (v1 verified working); Kraken has no public network API (manual table); Colosseum's login-gated gallery could hide prior art.
