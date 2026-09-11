# Verity

**Sealed accountability findings, bought blind and settled on chain.** Observers of public records get paid for being early and right, and paid in full only if the finding reaches the public.

Verity is the inverse of the Truth API. The Truth API sells a *manufactured* window: information that would be instantly public, withheld from non-payers. Verity sells a *discovered* window: facts sitting unread in public records, sold on the condition that they become public.

- **Live app:** _pending Vercel deploy_
- **Chain:** Base Sepolia (84532) · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

| Contract | Address |
|---|---|
| VerityMarket (verified) | [`0xBe235B1169184272808745c1f2916892Bb0bf9da`](https://sepolia.basescan.org/address/0xBe235B1169184272808745c1f2916892Bb0bf9da#code) |
| StandingBids (verified) | [`0x473055227638f317A96AaE76C728a89c1554321D`](https://sepolia.basescan.org/address/0x473055227638f317A96AaE76C728a89c1554321D#code) |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Read **[DESIGN.md](DESIGN.md)** first. It states the limitations and the trust model before anything else.

## The good being traded
The good is a staked, falsifiable claim about what a forthcoming public record will show, plus the sealed evidence trail behind it:

```
claim:      Agency X document N will be published in the Federal Register by D
resolves:   Federal Register API
evidence:   committed hash · AES-256-GCM envelope
bond:       7x upfront
price:      10% upfront + 90% contingent
exclusive:  fixed at commit, then auto-public
```

## How it works
1. **Commit.** The seller's client encrypts the package and seals the key to the key-release layer. On chain go the claim hash, payload hash, resolver, deadline, price split, bond, exclusivity window, confidence, and a Bloom filter of entities. *This person knew this, then.*
2. **Preview.** The buyer intersects their beat with the Bloom filter locally and sees a count, never which entities matched.
3. **Purchase.** Both tranches are escrowed. Upfront goes to the seller, and contingent is held. Payment works from a wallet or from an agent over **x402**.
4. **Delivery.** `/api/key/:id` releases the key iff `canDecrypt(id, you)`, which is `purchased || block.timestamp >= exclusivityEnd`. The seller is offline and not in the path.
5. **Resolution.** A bonded proposer checks the resolver, and anyone can dispute within the challenge window, with the owner as backstop.
6. **Settlement.**

| Outcome | Contingent | Bond |
|---|---|---|
| True, public by deadline | → seller | returned |
| True, not public | → public-goods pool | returned |
| False | → refunded to buyer | 50% slashed (½ buyers, ½ pool) |
| Fabricated | → refunded to buyer | 100% slashed (buyers made whole first, rest to pool) |

## Repo
```
contracts/            Foundry — VerityMarket.sol, StandingBids.sol, tests for every settlement path
app/                  Next.js 15 + wagmi/viem, b@b terminal theme
  lib/                crypto, bloom, keyRelease (KeyReleaseProvider), resolvers, events, calibration, x402
  app/api/            feed · key/:id · payload · x402/claims[/:id/preview|/:id/buy]
  scripts/            seller-fedreg (reference agent) · buyer-newsroom · oracle · fabricator · demo
DESIGN.md             limitations, trust model, designed-not-built, roadmap
```

## Run it
```bash
# contracts
cd contracts && forge test -vv

# app
cd app && npm install
cp .env.example .env.local        # fill in addresses + keys
npm run dev                        # http://localhost:3000

# the demo: one command, from cold (slash first, then the happy path, then auto-release)
VERITY_API=http://localhost:3000 npm run demo
```

The agents read their keys from `../.env.agents` (gitignored).

## Trust model, in one paragraph
The escrow and settlement are code. The **oracle** is a single bonded proposer, open to dispute within a challenge window (120 s on the demo deployment, 24 h in production), with an **owner backstop** for disputes. It is not decentralized. **Key release** in v1 is a **stateless custodian**: it can release a key early or refuse to release one, but it cannot forge purchases or move the exclusivity date. The drop-in upgrade is Lit Protocol, running the same `canDecrypt` predicate on a threshold network. Details are in [DESIGN.md](DESIGN.md).

## Testnet scaling
Prices are scaled by 1/1000 so that faucet USDC can run the market: $1.78 here would be $1,780.
