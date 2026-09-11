# Verity

**Sealed accountability findings, bought blind and settled on chain.** Observers of government records get paid for being early and right, and paid in full only if the finding reaches the public.

President Donald John Trump, on August 1st of this year, released a paid data service for his social media platform Truth Social. This filing offers firms on Wall Street low-latency access (up to 200ms faster than public) on the platform’s top influential accounts. 

Critics of this service cite previous examples of market volatility as a result of Trump’s posts. For instance, on April 9th of 2025, Trump posted “THIS IS A GREAT TIME TO BUY!!! DJT” - right before announcing a 90-day pause on tariffs that caused the S&P to surge 9.5%. 

This paid data service costs up to $100,000 per year and the only data source is Trump himself. There exists a market in this space that focuses on faster journalism with the government. It would reward people for spotting government and contractor failures with minimal media coverage, hinging on the finding being published to the public.

**The point of Verity is to be the opposite of this, where independent journalists and lawyers can sell information they gather across the entire government's functions.** This goes beyond just one platform. Currently, this uses live DOJ data to settle contracts, but it could be expanded to SEC filings, FDA information, and many more.

**There are a few players here:**

1. Sellers - Observers with an aggregation advantage to the public. These people are journalists and whistleblowers. They shed improve the rate at which information can be released and get rewarded for going through incredibly complex and lengthy documents

2. Buyers - People that want and use the information. This includes news organizations and legal teams litigating certain issues. Buyers already exist and currently pay contracted laywers to do this. The market decentralizes it.

3. Oracles / programs - These agentic programs verify and ensure that the rules of the market (consequences for fake / incorrect info) are properly followed. 

This also enables freelance reporters to have a stake within the gov-news sector, something that would have been incredibly difficult if they were not affiliated with a large organization. Aligning with the fundamentals of blockchain, this promotes transparency and a better spread of information.

- **Live app:** https://verity-andrew-2d2a.vercel.app
- **Agent API:** https://verity-andrew-2d2a.vercel.app/api/x402/claims
- **Chain:** Base Sepolia (84532) · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

| Contract | Address |
|---|---|
| VerityMarket v2 | [`0xfef2d6dc0513b0e4b9653f8f3ae042205efda90b`](https://sepolia.basescan.org/address/0xfef2d6dc0513b0e4b9653f8f3ae042205efda90b#code) |
| StandingBids | [`0xc475750c04cc208c1c171d9786a0c53a66bbec8e`](https://sepolia.basescan.org/address/0xc475750c04cc208c1c171d9786a0c53a66bbec8e#code) |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

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

## How it works
1. The seller's agent salts each item, builds the Merkle root, encrypts the basket and seals the key to the key-release layer. 
2. The listing shows *expected by chance* (n × p0), *random-basket odds* (binomial P(X ≥ k | n, p0)) and *seller lift* (realized item hit rate / p0). 
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


## Testnet scaling
Prices are scaled by 1/1000 so that faucet USDC can run the market: $1.78 here would be $1,780.
