# Verity: design, trust model, and limitations

This document puts Verity's weaknesses first. It is more credible to state them than to let a reviewer find them.

## The good (v2)
A k-of-N sealed basket of federal False Claims Act cases: "3 of 12 sealed federal fraud cases will produce a DOJ settlement release by Oct 11." The count, deadline and resolver are public and composed by the contract. Which cases is the sealed good, bound at commit by a Merkle root over salted items. The buyer can compare the claim to what chance would do: *expected by chance*, *random-basket odds* and *seller lift* are on every listing. v1 sold "Federal Register document X will publish", which is true by construction and worth nothing; v2 replaces it (spec: `docs/superpowers/specs/2026-09-11-fca-basket-v2-design.md`).

## Limitations

### 1. The measured edge is modest and the sample is small
`research/backtest-fca.py` matched CourtListener RECAP notices to 2,000 justice.gov FCA press releases (2015–2026). Settlement-intervention notices drew a release naming the defendant within 30 days 9.6% of the time (8/83) and within 60 days 10.8% (9/83). Declined cases, the base rate: 1.8% (2/114) and 5.3% (6/114). The lift is about 5× at 30 days and 2× at 60, because settlement releases cluster early (median lead 14 days vs 41). With nine signal hits, the confidence intervals are wide. The design spec quoted 14% vs 2%; that figure came from an earlier matcher whose generic caption words ("University", "Mortgage", "Michigan") produced false matches, and it is superseded. Both rates are floors: title-only matching misses releases that name the defendant only in the body. Odds between the measured points are piecewise linear (0 → 30 d → 60 d, flat after), which is a stated approximation.

### 2. Matching is a rule, not judgment
An item hits when a justice.gov release after the commit, in an FCA context (topic, "False Claims" in the title, or "qui tam" in the body), has a title that names one of the item's match terms on a word boundary. Match terms must be at least 6 letters and not in the shared stoplist (`app/lib/fca-stoplist.json`, which the backtest uses too). A distinctive surname term can still false-match ("Martin"); a subsidiary announced under a parent's name can miss. The oracle re-applies the rule, so a seller cannot smuggle in a generic term, and disputes with a corrected hit mask go to the owner backstop.

### 3. Replays are demonstrations, not forecasts
`DOJ_FCA_REPLAY` exists so the demo can settle in minutes. Its items' outcomes are already public. Replay claims pay out normally but never touch `SellerRecord`, and the app excludes them from Brier and lift. The UI labels them everywhere.

### 4. The velocity gap
Verity sells weeks, not milliseconds. The only way to be faster than a public record is to know what it will say before it exists, which means recruiting insiders, and that breaks the legal foundation Verity rests on: sellers read public dockets; they do not have a duty of confidentiality.

### 5. The mirror objection
**The objection.** A basket of defendants about to settle with DOJ is market-moving for public contractors. Selling it before publication looks like the Truth API: a paid window of early access to price-moving information.

**The answer.**
- **Every input is already public.** The sealed notice sits on a public docket (RECAP). The seller sells the labor of reading hundreds of dockets, not a breach of confidence. Every commit carries the no-MNPI attestation, and the contract rejects commits without it.
- **Publication is unavoidable and scheduled.** Exclusivity is fixed at commit; when it ends the key opens to everyone. The resolver is DOJ itself, which publishes regardless.
- **Suppression doesn't pay.** A true basket that is not public by the deadline sends the contingent tranche to a public-goods pool.

The objection still carries weight: for a few weeks some buyers know which cases are in the basket. We think a short, fixed window is an acceptable price for paying people to read public records.

### 6. Supply is the residual
Good leads are mostly used by whoever holds them. Verity clears what the holder cannot use: no distribution, no capital to wait. **Underwriting pools** (below) raise that ceiling.

### 7. The relevance preview is a Bloom filter, not PSI
Buyers intersect a watchlist (`defendant:<term>`, `court:<name>`) with a 512-bit, k=4 Bloom filter locally and see a count. **The filter can be probed** one candidate at a time, and it has false positives. Upgrade path: OPRF-based private set intersection, or an enclave that attests to returning only a count.

## Trust model: stated plainly

| Component | Who you trust | What they can do wrong | What they cannot do |
|---|---|---|---|
| **Escrow + settlement** (`VerityMarket.sol`) | Code on Base Sepolia (verified) | — | — |
| **Oracle** | A single **bonded proposer**; anyone may dispute within the challenge window (120 s on the demo deployment, 24 h in production) by posting a matching bond; the **owner** resolves disputes with a corrected mask | An unchallenged wrong proposal settles wrong. The owner can decide disputes wrongly. | Propose a mask inconsistent with the outcome (the contract checks popcount vs k and the deadline); settle before the window; move money outside the table |
| **Key release (v1)** | **A stateless custodian** holding one X25519 secret (`/api/key/:id`) | **Release a key early, or refuse to release one.** The largest trust assumption. | Forge a purchase, move `exclusivityEnd`, or alter the ciphertext (the hash is on chain) |
| **Seller** | Nobody. Offline after commit. | Lie. That is what the bond is for. | Swap items after commit (`itemsRoot`), misstate k or n (the contract writes them), stall delivery |
| **Resolvers** | justice.gov, CourtListener | — (indifferent to the contract) | — |

This is not a "decentralized oracle." It is an optimistic oracle with one proposer and an owner backstop, and we say so.

### Evidence without leaks
The oracle publishes its evidence JSON with every proposal: per item the leaf, the Merkle proof and hit/miss. Hit items are revealed in full, since their DOJ release is already public. Misses stay sealed until exclusivity ends, so an early TRUE does not give away the pending cases buyers paid for. The claim page recomputes every leaf and proof in the browser against the on-chain root.

### Key release: why the seller is not in the delivery path
At commit the seller's client encrypts the basket under a fresh AES-256-GCM key K and seals K to the key-release layer's public key with `nacl.box`. `keccak256(envelope)` is the on-chain `payloadHash`. Delivery needs only the envelope, the custodian's secret, and `canDecrypt(claimId, requester)` (`purchased || block.timestamp >= exclusivityEnd`). **Upgrade: Lit Protocol**: the same predicate evaluated by a threshold network through `KeyReleaseProvider` (`app/lib/keyRelease.ts`).

## Mechanism notes
- **k-of-N.** `1 ≤ k ≤ n ≤ 64`; the teaser body is ≤ 240 bytes; the deadline is at most 120 days out. TRUE may be proposed as soon as k items hit; FALSE only after the deadline with fewer than k.
- **Leaves.** `keccak256(keccak256(abi.encode(index, keccak256(canonicalJSON(item)))))`, sorted-pair OpenZeppelin `MerkleProof`. Each item carries a 32-byte salt, so the root cannot be brute-forced from docket lists. `verifyItem` checks any item on chain; a forge test verifies a root produced by the TypeScript code.
- **Seller lift.** `SellerRecord.itemsHit / itemsCommitted` (settled, non-fabricated, non-replay) divided by p0 for 60 days.
- **Both tranches are escrowed at purchase.** Upfront is forwarded immediately; contingent is held.
- **Auto-release counts as publication.** `publicByDeadline = (publishedAt != 0 && publishedAt <= deadline) || exclusivityEnd <= deadline`. The oracle marks a TRUE basket published, since its hits are DOJ press releases.
- **Fabricated vs. false.** Fewer than k hits is FALSE: 50% of the bond, split between buyers and the pool. A missing docket entry, a payload-hash mismatch, or a basket that does not match the root is FABRICATED: 100%, buyers made whole on their upfront first.
- **Decay.** The upfront ask falls linearly to 50% over the exclusivity window.
- **Standing bids.** Escrowed in `StandingBids.sol`; a fill routes through `purchaseFor`.
- **Novelty.** Each listing shows how many prior open commits have entity filters overlapping more than 30%.
- **Testnet scaling.** Prices are scaled by 1/1000 ($1.78 here would be $1,780).

## Designed, not built
Graded (per-hit) payouts; an on-chain base-rate oracle; PSI; Lit key release; per-buyer watermarking.

### Staked juror dispute layer
Replaces the owner backstop with a randomly drawn, staked panel scored in Schelling-point fashion (Kleros, UMA's DVM). Worth building once dispute volume justifies the latency.

### Underwriting pools, the biggest lever on supply depth
A third party stakes the bond for a credible docket reader in exchange for a share of the upside, and absorbs the slash. The pool's own lift across the sellers it backs becomes a second-order reputation market.

## Roadmap: supply-side moves
1. **Forkable seller agents.** `app/scripts/seller-fca.ts` is the template (read, filter, size, commit). The same shape fits any list with an indifferent public resolver: state AG settlements, OIG exclusions, SEC litigation releases.
2. **Better matching.** Body-text matching with entity resolution would lift both rates off the floor; the backtest and the oracle must change together (they share the stoplist today).
3. **Seed standing bids before inventory.**
4. **Underwriting pools** (above).
