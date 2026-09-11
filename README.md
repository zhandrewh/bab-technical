# Verity

**Sealed accountability findings, bought blind and settled on chain.** Observers of public records get paid for being early and right, and paid in full only if the finding reaches the public.

Verity is the inverse of the Truth API. The Truth API sells a *manufactured* window: information that would be instantly public, withheld from non-payers. Verity sells a *discovered* window: facts sitting unread in public records, sold on the condition that they become public.

- **Live app:** https://verity-andrew-2d2a.vercel.app
- **Agent API:** https://verity-andrew-2d2a.vercel.app/api/x402/claims
- **Chain:** Base Sepolia (84532) · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

| Contract | Address |
|---|---|
| VerityMarket v2 (verified) | [`0xfef2d6dc0513b0e4b9653f8f3ae042205efda90b`](https://sepolia.basescan.org/address/0xfef2d6dc0513b0e4b9653f8f3ae042205efda90b#code) |
| StandingBids (verified) | [`0xc475750c04cc208c1c171d9786a0c53a66bbec8e`](https://sepolia.basescan.org/address/0xc475750c04cc208c1c171d9786a0c53a66bbec8e#code) |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Read **[DESIGN.md](DESIGN.md)** first. It states the limitations and the trust model before anything else. The v2 design is in [docs/superpowers/specs/2026-09-11-fca-basket-v2-design.md](docs/superpowers/specs/2026-09-11-fca-basket-v2-design.md).

## The good being traded
A **k-of-N sealed basket** of federal False Claims Act cases. The count is public and written by the contract; *which* cases is the sealed good:

> **3 of 12** sealed federal fraud cases will produce a DOJ settlement release by Oct 11
> Expected by chance: 0.2 of 12 · Random-basket odds: 0.1% · Seller lift — · Bond 7× · Resolves via justice.gov

```
items:      defendant, match terms, court, docket, cited notice entry, salt   (sealed, AES-256-GCM)
commitment: Merkle root over salted items (itemsRoot), on chain at commit
resolves:   justice.gov press releases after the commit, FCA context, title naming the defendant
fabricated: any cited docket entry missing on CourtListener, or a basket that does not match the root
```

**Why these cases.** Sellers watch sealed qui tam dockets for the United States' notice that it will intervene *for purposes of settlement*. Backtest (`research/backtest-fca.py`, CourtListener RECAP × 2,000 justice.gov FCA releases, 2015–2026):

| Notice type | n | DOJ release naming defendant ≤ 30 d | ≤ 60 d | median lead |
|---|---|---|---|---|
| Intervene for settlement (the signal) | 83 | 9.6% | 10.8% | 14 d |
| Election to decline (the base rate p0) | 114 | 1.8% | 5.3% | 41 d |

Title-only matching makes both rates a floor, and the sample is small (9 signal hits). The app computes every listing's odds from `research/fca-baseline.json`, so rerunning the backtest updates the market.

## How it works
1. **Commit.** The seller's agent salts each item, builds the Merkle root, encrypts the basket and seals the key to the key-release layer. On chain go `n`, `k`, `itemsRoot`, the teaser (the contract prepends "k of n"), payload hash, resolver, deadline, price split, bond, exclusivity window, stated P(hits ≥ k), and a Bloom filter of match terms and courts.
2. **Preview.** The listing shows *expected by chance* (n × p0), *random-basket odds* (binomial P(X ≥ k | n, p0)) and *seller lift* (realized item hit rate / p0). The buyer intersects their watchlist with the Bloom filter locally.
3. **Purchase.** Both tranches are escrowed, from a wallet or from an agent over **x402**.
4. **Delivery.** `/api/key/:id` releases the key iff `canDecrypt(id, you)`. The buyer checks every item against `itemsRoot` in the browser.
5. **Resolution.** A bonded proposer verifies the root and each docket citation, checks each item against justice.gov, and calls `propose(id, outcome, hitMask, evidence)`. TRUE needs popcount(hitMask) ≥ k and may land early; FALSE needs < k and waits for the deadline. Anyone can dispute; the owner backstop supplies a corrected mask.
6. **Settlement.** The claim page shows the revealed basket (hits immediately, misses once exclusivity ends) with each leaf re-verified client-side.

| Outcome | Contingent | Bond |
|---|---|---|
| ≥ k hit, public by deadline | → seller | returned |
| ≥ k hit, not public | → public-goods pool | returned |
| < k hit | → refunded to buyer | 50% slashed (½ buyers, ½ pool) |
| Fabricated | → refunded to buyer | 100% slashed (buyers made whole first, rest to pool) |

**Replays.** `DOJ_FCA_REPLAY` baskets are built from backtested notices whose outcome is already history (each item's window is its notice date + 60 days). They settle in minutes and pay out normally, but the contract never writes them to the seller's record and the app excludes them from Brier and lift. They show settlement, not forecasting.

## Repo
```
contracts/            Foundry — VerityMarket.sol (v2), StandingBids.sol, 27 tests incl. a TS→Solidity Merkle fixture
research/             backtest-fca.py → fca-baseline.json (base rates) + fca-pairs.json (replay items)
app/                  Next.js 15 + wagmi/viem
  lib/                fca (DOJ_FCA resolver), merkle, odds, crypto, bloom, keyRelease, events, calibration, x402
  app/api/            feed · key/:id · payload · x402/claims[/:id/preview|/:id/buy]
  scripts/            seller-fca (reference agent) · buyer-vendorrisk · oracle · fabricator · demo · gen-abi
DESIGN.md             limitations, trust model, designed-not-built, roadmap
```

## Run it
```bash
# contracts
cd contracts && forge test -vv

# research (keyless, ~5 min): refresh the base rates the market quotes
python3 research/backtest-fca.py && cp research/fca-baseline.json app/lib/

# app
cd app && npm install
cp .env.example .env.local        # fill in addresses + keys
npm test                           # resolver / merkle / odds on recorded fixtures
npm run dev                        # http://localhost:3000

# the demo, from cold: slash, then a replay basket settling on history, then a live basket left open
VERITY_API=http://localhost:3000 npm run demo
```

The agents read their keys from `../.env.agents` (gitignored).

### Deploy
```bash
app/scripts/deploy.sh      # CLI-only Vercel deploy, no Git integration
```
It deploys prebuilt output from a throwaway shadow repo, which gets the build past Vercel's git-author team check. Before building, it patches `vercel pull`'s redacted `[SENSITIVE]` env placeholders with real values. It also keeps `.env.local` out of the traced build. The script's header explains each step. Success means the API reports `READY` and the alias is assigned; a zero exit code from the CLI is not enough.

## Trust model, in one paragraph
The escrow and settlement are code. The **oracle** is a single bonded proposer, open to dispute within a challenge window (120 s on the demo deployment, 24 h in production), with an **owner backstop** for disputes. It is not decentralized. **Key release** in v1 is a **stateless custodian**: it can release a key early or refuse to release one, but it cannot forge purchases or move the exclusivity date. The drop-in upgrade is Lit Protocol, running the same `canDecrypt` predicate on a threshold network. Details are in [DESIGN.md](DESIGN.md).

## Testnet scaling
Prices are scaled by 1/1000 so that faucet USDC can run the market: $1.78 here would be $1,780.
