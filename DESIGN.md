# Verity: design, trust model, and limitations

This document puts Verity's weaknesses first. It is more credible to state them than to let a reviewer find them.

## Limitations

### 1. The velocity gap
The Truth API sells 200 milliseconds; Verity sells weeks. They are different products. Verity cannot match the Truth API's latency without becoming a leak market. The only way to be faster than a public record is to know what it will say before it exists. That means recruiting insiders, which breaks the legal foundation Verity rests on: sellers are observers of public records, not people with a duty of confidentiality. Verity's latency is bounded by how quickly observers can notice something already on the record, and it will stay that way.

### 2. The mirror objection
**The objection, in full.** Verity presents itself as the moral inverse of the Truth API. Yet the best-capitalized buyer we name is the activist short seller. The product sells private, market-moving claims about public contractors before they are published. That is structurally the same thing as the Truth API: a paid window of early access to information that moves prices, sold to people who trade on it. The difference is only a matter of degree.

**The answer.**
- **Publication is unavoidable and scheduled.** The exclusivity window is fixed at commit, before anyone knows what the package is worth, and when it ends the key opens to everyone (`canDecrypt` returns true for any address). The Truth API's window exists to keep non-payers out permanently. Verity's window exists to end.
- **The seller base is observers, not insiders.** Every commit carries an attestation that the evidence comes solely from lawfully obtained public records, with no classified material and no MNPI. The contract rejects commits without it. The resolver whitelist means claims have to be about things that institutions will publish.
- **No duty is breached.** The inputs are aggregated public records. An activist short seller who buys a Verity finding knows only what anyone could have learned by reading the Federal Register, the docket, or SAM.gov that morning. The seller is selling the labor of reading, not a breach of confidence.
- **Suppression doesn't pay.** A buyer who holds a true finding past the deadline gets no refund; the contingent tranche goes to a public-goods pool.

The objection still carries weight: for a few weeks some buyers know something the public does not. We think a short, fixed window is an acceptable price for paying people to read public records.

### 3. Supply is the residual
Good leads are mostly written up by whoever holds them. Verity clears the findings whose holder lacks the distribution, the capital to wait for resolution, or the time to finish the story. That is a real market, but it caps quality: the best findings seldom reach it. **Underwriting pools** (below) are the mechanism that raises the ceiling, because they let a credible reporter post a bond they could not afford alone.

### 4. The relevance preview is a Bloom filter, not PSI
A buyer declares a beat and learns *how many* of their entities a package touches, computed locally against a 512-bit, k=4 Bloom filter of normalized identifiers (`app/lib/bloom.ts`). The buyer's beat never leaves the client. However, **the filter can be probed**: a determined buyer can test candidate identifiers one at a time and learn which entities are (probably) present. The filter also has false positives. Upgrade path: OPRF-based private set intersection (the seller evaluates an OPRF over the buyer's blinded set), or computing the intersection inside an enclave that attests to returning only a count.

## Trust model: stated plainly

| Component | Who you trust | What they can do wrong | What they cannot do |
|---|---|---|---|
| **Escrow + settlement** (`VerityMarket.sol`) | Code on Base Sepolia (verified) | — | — |
| **Oracle** | A single **bonded proposer**; anyone may dispute within the challenge window (120 s on the demo deployment, 24 h in production) by posting a matching bond; the **owner** resolves disputes | An unchallenged wrong proposal settles wrong. The owner can decide disputes wrongly. | Settle without the window elapsing; move money outside the §2.5 table |
| **Key release (v1)** | **A stateless custodian** holding one X25519 secret (`/api/key/:id`) | **Release a key early, or refuse to release one.** This is the largest trust assumption in v1. | Forge a purchase, move `exclusivityEnd`, or alter the ciphertext (the hash is on chain) |
| **Seller** | Nobody. The seller is offline after commit. | Lie. That is what the bond is for. | Stall delivery, choose when publication happens, or swap the payload |
| **Resolvers** | Federal Register, SAM.gov, CourtListener | — (they are indifferent to the contract) | — |

This is not a "decentralized oracle." It is an optimistic oracle with one proposer and an owner backstop, and we say so.

### Key release: why the seller is provably not in the delivery path
At commit, the seller's client generates an AES-256-GCM key K, encrypts the package, and seals K to the key-release layer's public key with `nacl.box`. The sealed key travels inside the envelope, and `keccak256(envelope)` is the on-chain `payloadHash`. From then on, delivering the key needs only three things: the envelope (IPFS, or the commit calldata itself), the custodian's secret, and a read of `canDecrypt(claimId, requester)`, which is `purchased[claimId][requester] || block.timestamp >= exclusivityEnd`. The seller holds none of these. Their machine can be off.

**Upgrade: Lit Protocol.** `KeyReleaseProvider` (`app/lib/keyRelease.ts`) is the seam. A `LitKeyRelease` provider encrypts K under Lit with an `evmContractConditions` check on `canDecrypt(:claimId, :userAddress) == true`, which is the same predicate, evaluated by a threshold network so that no single party holds K. We time-boxed Lit and did not get to it in this build. The custodian is the v1 fallback, and its trust assumption is stated above.

## Mechanism notes
- **Both tranches are escrowed at purchase.** Upfront is forwarded to the seller immediately, and the contingent tranche is held.
- **Auto-release counts as publication.** `publicByDeadline = (publishedAt != 0 && publishedAt <= deadline) || exclusivityEnd <= deadline`. A seller who picks an exclusivity window shorter than the time to deadline guarantees publication. A seller who picks a longer one accepts that a suppressing buyer can send the contingent tranche to the pool.
- **Fabricated vs. false.** FALSE means the institution didn't do the thing by the deadline; the seller loses 50% of the bond, split between buyers and the pool. FABRICATED means the payload hash doesn't match, or the cited records don't exist; the seller loses 100%, buyers are made whole on their upfront first, and the remainder goes to the pool. FABRICATED may be proposed at any time. FALSE may only be proposed after the deadline.
- **Decay.** The upfront ask falls linearly to 50% over the exclusivity window. Leads rot.
- **Standing bids.** Bids are escrowed in `StandingBids.sol`, and a fill routes through `purchaseFor`, so a filled bid is indistinguishable from a purchase. v1 checks Brier eligibility off-chain from the event log. An on-chain version would need a calibration attestation posted by the oracle.
- **Novelty.** Each listing shows how many prior open commits have entity filters overlapping more than 30% (Jaccard over set bits). This catches set-splitting and duplicate supply.
- **Hard rules enforced in code.** Exclusivity is fixed at commit (rule 1). The resolver whitelist, which has no buyer-controlled resolvers, covers rules 2 and 3. The attestation hash is required at commit (rule 4). Novelty is surfaced on every listing (rule 5).
- **Testnet scaling.** Prices are scaled by 1/1000 so that faucet USDC is enough ($1.78 here would be $1,780).

## Designed, not built

### Per-buyer watermarking
Every buyer of the same claim receives the same plaintext, so a leak can't be traced. Design: at key release, the release layer returns a per-buyer *rendering key*, and the package is stored as a template plus a set of synonym and whitespace substitution slots. The rendering applies a buyer-specific codeword (derived from `HMAC(releaseSecret, buyer ‖ claimId)`), chosen from a collusion-resistant code (Tardos) so that a leaked copy identifies at least one leaking buyer with high probability. The limitation is that summarizing or paraphrasing the finding strips the mark. Watermarking deters verbatim leaks and nothing more. It is stubbed; the interface is `render(pkg, buyer) -> string`.

### Staked juror dispute layer
Replaces the owner backstop. Disputes go to a randomly drawn panel of jurors who have staked and are scored against each other in Schelling-point fashion, as in Kleros or UMA's DVM. It is only worth building once dispute volume justifies the latency.

### Underwriting pools, the biggest lever on supply depth
A third party stakes the bond on behalf of a credible reporter in exchange for a share of the upside: part of the upfront, and part of the contingent on TRUE. The pool also absorbs the slash on FALSE or FABRICATED. The effect is to turn a reporter with a good lead but no capital into a seller whose bond signals confidence, backed by someone who has done their own diligence. The pool's own calibration history, a Brier score across the reporters it has backed, becomes a second-order reputation market. That is how supply grows past the residual.

## Roadmap: supply-side moves
1. **Ship forkable seller agents, not a recruitment pitch.** `app/scripts/seller-fedreg.ts` is the template (poll, detect, package, price, commit). Next up are a state WARN-notice watcher, a county docket watcher, and a SAM.gov exclusions diff.
2. **Seed standing bids before inventory.** A market with bids and no inventory recruits sellers. A market with inventory and no bids dies.
3. **Underwriting pools** (above).
4. **Shorten the oracle.** Favor claim types that resolve in days: Federal Register publication, docket entries, agenda postings, 8-K filings, registry status changes. Faster settlement means faster reputation accrual, so more sellers clear the trust bar each month.
