# Verity v2: k-of-N sealed FCA baskets

Status: approved in chat 2026-09-11. Replaces the Federal Register "document X will publish" good.

## Problem
v1 listings read "Will Federal Register confirm it by Sep 13?". Two causes:
1. Nothing public is quantified. Only `keccak256(claimText)` is on chain, so the UI invents a generic question.
2. The good is near-worthless. Public-inspection filings publish on schedule ~100% of the time; the claim is true by construction and the buyer learns nothing they couldn't read for free.

The target shape is "2 of our 14 emails will appear in the auditor's leak list within the week": a public, quantified claim against an independent list with a low base rate, where *which* items is the sealed good.

## The good
**Vertical:** federal procurement and healthcare fraud: qui tam False Claims Act (FCA) cases.

**Edge (measured, `research/backtest-fca.py`):** when the United States files a notice of election to intervene *for purposes of settlement* in a sealed FCA case, justice.gov publishes a settlement release naming that defendant within 60 days in **14%** of cases (n=110), vs **2%** for notices of election to *decline* (n=134). Median lead 14 days (range 1–57). DOJ announced *before* the notice in ~7% of cases. The 14% is a floor: title-only name matching misses USAO releases without "False Claims" in the headline. Real pairs: Lockheed Martin (notice 2025-01-27 → release 2025-02-06), Raytheon (2025-04-07 → 05-01), Aetna (2026-03-09 → 03-11), Exactech, Delta, Illumina, Honeywell (2026-08-18 → 09-01).

**Participants.** Sellers: docket-reading agents, relator-side paralegals. Buyers: compliance/vendor-risk teams, investors' diligence agents, investigative reporters. Resolver: the Department of Justice, indifferent to the contract.

**Listing (public, on chain):**
> **3 of 12** sealed federal fraud cases will produce a DOJ settlement release by Oct 11
> Expected by chance: 0.2 of 12 · Random-basket odds: 0.1% · Seller lift 7× · Bond 7× · Resolves via justice.gov

**Sealed (encrypted envelope):** per item `{defendant, matchTerms[], court, docketId, docketNumber, entryDate, entryText, courtlistenerURL, salt}`, plus the seller's analysis.

## 1. Contract: VerityMarket v2

### Commit
`CommitParams` changes:
- remove `claimHash`
- add `uint8 n`, `uint8 k` with `1 <= k <= n <= 64`
- add `bytes32 itemsRoot`: Merkle root (sorted-pair keccak, OpenZeppelin `MerkleProof` compatible) over leaves `keccak256(bytes.concat(keccak256(abi.encode(index, itemHash))))`, `itemHash = keccak256(canonicalItemJSON)`, and the canonical JSON includes a 32-byte random `salt`
- add `string teaserBody` (≤ 240 bytes, non-empty)

The contract composes the headline: `teaser = "{k} of {n} " + teaserBody` (OZ `Strings.toString`), stores it, and emits it in `Committed`. The seller cannot misstate the numbers. `claimHash` is dropped; the stored teaser and `itemsRoot` bind the claim. A `window` cap (deadline − now ≤ 120 days) applies.

All v1 fields stay: payloadHash, resolverId, deadline, exclusivitySeconds, upfront, contingent, bond, confidenceBps (seller's P(hits ≥ k)), domain, attestation, payloadURI, bloom.

### Resolution
- `propose(id, Outcome outcome, uint64 hitMask, string evidenceURI)`
  - `hitMask < 2**n` (else `BadParams`)
  - TRUE ⇒ `popcount(hitMask) >= k`; allowed before the deadline (early resolution)
  - FALSE ⇒ `popcount(hitMask) < k` and `block.timestamp >= deadline`
  - FABRICATED ⇒ any time; hitMask ignored (stored as 0)
- `dispute` is unchanged. `resolveDispute(id, outcome, hitMask)`: the owner supplies the corrected mask under the same consistency rules.
- The Claim stores `hitMask` and `hits`. `Settled` emits `hits` and `hitMask`.
- The payout table is unchanged (TRUE → contingent to seller if public by deadline, else to pool; FALSE → refund + 50% slash; FABRICATED → refund + 100% slash, buyers first).

### Reputation
`SellerRecord` adds `uint32 itemsCommitted` (on settle, += n, excluding FABRICATED) and `uint32 itemsHit` (+= hits). Lift = (itemsHit/itemsCommitted) / reference base rate, computed in the app.

### Replay resolvers
`mapping(bytes32 => bool) public replayResolver` (owner-set via `setResolver(id, allowed, replay)`). Claims on replay resolvers settle normally but never modify `SellerRecord`, and the app excludes them from calibration and lift. They exist so a backtest basket can settle in minutes during the demo without faking a forecast.

### StandingBids
Unchanged source; redeployed against the v2 market.

## 2. Resolver: DOJ_FCA (and DOJ_FCA_REPLAY)
Source: `https://www.justice.gov/api/v1/press_releases.json` (keyless).

Item *i* **hits** iff some release R satisfies all of:
1. `committedAt < R.date <= deadline` (replay: `asOf < R.date <= asOf + window`, with `asOf` and `window` stated in the sealed package and the teaser)
2. FCA context: R.topic includes "False Claims Act", **or** R.title contains "False Claims", **or** R.body contains "qui tam"
3. R.title contains, case-insensitive on word boundaries, at least one of item *i*'s `matchTerms`

`matchTerms` rules (enforced by the seller agent and re-checked by the oracle; a violating term is ignored): ≥ 6 characters, not in the generic stoplist (health, medical, services, systems, home, care, …).

**FABRICATED** iff any item's `courtlistenerURL` docket does not exist, or its cited entry text/date is not on that docket (checked via CourtListener search `docket_id:` + entry date), or the decrypted payload's hash ≠ `payloadHash`, or a revealed leaf doesn't verify against `itemsRoot`.

`evidenceURI` points to a JSON `{items: [{index, defendant, hit, releaseURL?, releaseDate?, leaf, proof}]}` stored like envelopes.

Retired: FEDREG, SAM, COURTLISTENER resolvers and `seller-fedreg.ts`.

## 3. Sharpness math (app `lib/odds.ts`)
- Reference base rate `p0`: declined-case control per-item hit rate for the claim's window, from `research/fca-baseline.json` (produced by the backtest; includes n, window, date range, method). Scaled linearly for windows under 60 days, as a stated approximation.
- Expected by chance = `n × p0`.
- Random-basket odds = binomial `P(X >= k | n, p0)`.
- Seller lift = seller's realized precision / p0 (null until a settled item exists).

## 4. Agents
- `seller-fca.ts`: CourtListener RECAP search for settlement-intervention notices in the last 45 days → drop cases with a matching DOJ release already → build matchTerms from the caption (defendant side, cleaned) → choose n (up to 12) → pick the largest k with `P(X >= k | n, p_seller) >= confidence`, where `p_seller` is the backtested 14%/60d scaled to the window → salt, merklize, encrypt, commit. Flags: `--replay` builds a basket from backtest pairs, `asOf` in the past, on DOJ_FCA_REPLAY.
- `oracle.ts`: find claims past exclusivity or deadline (or where early TRUE is reachable) → fetch key → decrypt → verify payload hash and leaves → evaluate items → propose with hitMask + evidence JSON → settle after the window.
- `buyer-*.ts`: a vendor-risk buyer with a contractor watchlist → bloom overlap → buys if random-basket odds < 5%, seller lift ≥ 3 (or bond ≥ 5× for new sellers), price within budget → pays via x402.
- `fabricator.ts`: cites a nonexistent docket entry → FABRICATED → slashed.
- `demo.ts`: Act 1 slash, Act 2 replay basket settles TRUE, Act 3 live baskets committed from current notices and left open.

## 5. UI
- Cards and featured: the teaser is the headline; a k-of-N dot row; "expected by chance" vs claimed; random-basket odds; seller lift; bond; price split.
- Claim page: teaser, odds panel, and after settlement or auto-release the revealed basket table (defendant, docket entry link, ✓/✗ with release link, a "verified against root" badge from the client-side Merkle check).
- Commit form: a basket builder (rows of items), live odds, suggested k; the teaser prefix is shown as locked.
- x402 API and feed expose n, k, teaser, hits, odds.

## 6. Verification
- Forge: commit validation (n/k bounds, teaser length, window cap, composed teaser string), propose mask rules (boundary popcount = k and k−1, mask ≥ 2^n, early TRUE, early FALSE reverts), dispute with corrected mask, all payout paths, itemsCommitted/itemsHit accounting, replay exclusion, StandingBids fill against v2.
- Resolver: unit tests on recorded DOJ + CourtListener fixtures (hit, miss, pre-commit release ignored, generic matchTerm ignored, fabricated docket).
- Merkle: TS leaf/proof generation verified against the Solidity `MerkleProof` in a forge test using a fixture root produced by the TS code.
- Testnet: deploy + verify both contracts on Base Sepolia; run the demo from cold; confirm settled events and the UI.
- Docs: README and DESIGN.md rewritten (the new good, measured edge with caveats, matching-rule limits, the replay caveat, trust model). Deploy via `app/scripts/deploy.sh`.

## Out of scope
Graded (per-hit) payouts, on-chain base-rate oracle, PSI, Lit key release, juror disputes. These remain in DESIGN.md "designed, not built".
