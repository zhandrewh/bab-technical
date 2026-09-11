# Verity — a blind-buy market for early fraud-case findings

**Live app:** https://verity-andrew-2d2a.vercel.app
**Chain:** Base Sepolia testnet (chain id 84532), paid in test USDC
**Main contract (verified):** [`0xfef2d6dc0513b0e4b9653f8f3ae042205efda90b`](https://sepolia.basescan.org/address/0xfef2d6dc0513b0e4b9653f8f3ae042205efda90b#code)
**Standing bids contract (verified):** [`0xc475750c04cc208c1c171d9786a0c53a66bbec8e`](https://sepolia.basescan.org/address/0xc475750c04cc208c1c171d9786a0c53a66bbec8e#code)
**Agent API:** https://verity-andrew-2d2a.vercel.app/api/x402/claims

## What it is, in one paragraph
Some people read court records for a living. They can often tell that a company is about to settle a fraud case with the U.S. government weeks before the Department of Justice (DOJ) announces it. Verity lets them sell that tip without giving it away first. The seller locks a list of cases in a sealed box and posts a public claim about it, such as *"3 of 12 of these sealed cases will get a DOJ settlement announcement by Oct 11."* A buyer, usually a software agent, pays to open the box. If the claim comes true, the seller gets paid. If it doesn't, the buyer gets money back and the seller loses a deposit. The contract holds the money the whole time.

## The vertical: federal False Claims Act cases
Under the False Claims Act, a whistleblower can sue a company on the government's behalf for defrauding it (Medicare billing, defense contracts, and similar). These lawsuits start out sealed. When the government decides to join a case *to settle it*, a notice shows up on the public court docket. A DOJ press release naming the company often follows a few weeks later.

- **Sellers** are docket readers: people or agents who watch hundreds of these filings.
- **Buyers** are vendor-risk and compliance teams, journalists, and analysts who want to know early whether a company they depend on is about to settle a fraud case.
- **The evidence** is a real court filing (checkable on CourtListener) plus the later DOJ press release (checkable on justice.gov). Neither the court nor DOJ knows or cares about Verity, which makes them neutral judges.
- **The failure modes we design against:** made-up filings, vague claims that can't be graded, sellers swapping their picks after the fact, and "predictions" that would have come true by luck anyway.

I backtested the signal against 11 years of data (CourtListener court filings matched to 2,000 DOJ press releases). When the government joined a case to settle it, a DOJ release named the company within 30 days **9.6%** of the time. For cases the government declined, it was **1.8%**. That is about a 5× edge, but the sample is small (9 hits), so the edge is modest.

## How a trade works
1. **Seller commits.** The seller's agent picks N cases, encrypts the list, and puts a fingerprint of it on chain (a Merkle root). It also posts a deposit (bond), a price, a deadline, and the claim "k of N will hit." The contract writes the "k of N" text itself, so the seller can't word it misleadingly.
2. **Buyer previews without seeing the list.** Each listing shows how many hits you would get *by pure chance* and the odds that a random basket does this well, so the buyer can tell whether the claim is impressive. The buyer can also check a watchlist of company names against a privacy filter (a Bloom filter) to see *how many* of their companies might be inside, without learning which ones.
3. **Buyer pays.** From a browser wallet, or from an agent over **x402** (the HTTP "402 Payment Required" standard), with no browser or popup involved. Payment is split into an upfront part (sent to the seller right away) and a contingent part (held by the contract).
4. **Buyer opens the box.** A key server hands over the decryption key only if the contract says this wallet paid. The buyer's browser checks that the decrypted list matches the fingerprint on chain, so the seller can't swap it.
5. **Oracle grades it.** A bonded grader checks every cited court filing and searches justice.gov for matching press releases. It then submits the result on chain, including which cases hit. Anyone can challenge that result within a time window.
6. **Money moves.**

| Result | Held payment | Seller's bond |
|---|---|---|
| k or more hit, and it's public | → seller | returned |
| k or more hit, but not public by the deadline | → public-goods pool | returned |
| fewer than k hit | → refunded to buyer | half taken (split between buyers and pool) |
| filings were fake | → refunded to buyer | all of it taken (buyers repaid first) |

7. **The box opens to everyone.** After a short exclusivity window set at commit time, anyone can get the key. Buyers pay for being early, and the information always becomes public in the end.

**Reputation:** every settled claim updates the seller's on-chain record (hit rate and "lift" over chance), and it is also written to the ERC-8004 agent reputation registry. Practice ("replay") baskets never count toward reputation.

## Trust assumptions
- **Code you don't have to trust:** escrow, payouts, slashing, and the fingerprint check are all in the verified contract.
- **The oracle is one bonded grader**, not a decentralized network. Anyone can dispute its answer, and the contract owner decides disputes. A wrong answer that nobody challenges settles wrong.
- **The key server is the biggest trust assumption.** It could release a key early or refuse to release one. It *cannot* fake a purchase, change the exclusivity date, or change the encrypted file. The planned replacement is Lit Protocol, which runs the same "did they pay?" check on a threshold network.
- **The seller is not trusted at all.** They go offline after committing, and the bond covers lying.

## Biggest design decision
**Sell a basket of cases graded against chance, not a single tip.** A single "company X will settle" tip is almost unsellable: you can't show it without giving it away, and one hit or miss says nothing about skill. A sealed "k of N" basket lets the market publish the count, the deadline, and the odds of doing that well at random, while the list itself stays sealed. Buyers get a real way to price a claim they can't see, and sellers build a track record measured as lift over chance instead of raw wins. (My first version sold "this Federal Register document will be published," which was true by construction and worth nothing. I threw it out for this.)

## One important limitation
**The edge is real but small, and grading is a word match, not judgment.** A case "hits" when a later DOJ fraud press release names the company in its title. Distinctive-but-common names can false-match, and a subsidiary announced under its parent's name can miss. The backtest has only 9 signal hits. A second limitation: the key server is centralized for now, as described above.

## What's on chain right now
| Claim | What it shows |
|---|---|
| #0 "4 of 6" | A fabricator cited court filings that don't exist. Graded **FABRICATED**: its whole bond was taken and the buyer was repaid. |
| #1 "3 of 10" (replay) | Built from past cases whose outcome is known, so it settles in minutes. 4 hits → **TRUE**, and the seller was paid. Excluded from reputation. |
| #2 "1 of 3" | A live basket from recent real filings, **open** until DOJ does or doesn't announce by Oct 11. |

## Run it
```bash
cd contracts && forge test -vv          # 27 contract tests
cd app && npm install && npm test && npm run dev
VERITY_API=http://localhost:3000 npm run demo   # the full three-act demo from the terminal
```
Prices are scaled down 1000× so faucet USDC works ($1.78 here means $1,780).
