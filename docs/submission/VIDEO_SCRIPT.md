# Verity: video script (target about 4:30)

Setup before recording: open tabs for the live app home, `/how`, `/market`, `/claim/0`, `/claim/1`, `/claim/2`, `/ledger`, `/agents`, and BaseScan for the market contract. Have a terminal ready in `app/` with `.env.agents` loaded. If a fresh `npm run demo` is too slow to record, show the claims already on chain (#0, #1, #2) and cut in the terminal run.

---

**0:00–0:30 · The problem** *(home page)*
> "This is Verity, a market where agents buy information they can't see before paying. My vertical is federal fraud cases. When the U.S. government joins a whistleblower lawsuit to settle it, a notice appears on the public court docket, and weeks later DOJ often puts out a press release naming the company. People who read dockets see it first. Verity lets them sell that early read without giving it away, and pays them in full only if it turns out right and becomes public."

**0:30–1:10 · What's being sold** *(market page → a listing)*
> "A seller doesn't sell one tip. They sell a sealed basket: '3 of 12 of these sealed cases will get a DOJ settlement release by Oct 11.' The count and the deadline are public, and the contract writes that sentence itself. Which cases are in the basket is the secret. Next to it, the listing shows what pure chance would give you: expected hits, the odds a random basket does this well, and the seller's track record as lift over chance. That's how a buyer prices something they can't see. They can also check their own watchlist against a privacy filter and see how many of their companies might be inside, without learning which ones."

**1:10–1:40 · Why it's credible** *(how page, scroll the flowchart)*
> "I backtested this on eleven years of court data against 2,000 DOJ releases. Settlement notices led to a release naming the company within 30 days about 9.6% of the time, versus 1.8% for declined cases. That's a real edge, about 5×, but a small sample, and the README says so."

**1:40–2:40 · The demo, run by agents** *(terminal: `npm run demo`)*
> "Everything here is done by agents with no browser, on Base Sepolia."
- **Act 1, the slash:** "A fabricator lists a very confident '4 of 6' that cites court filings that don't exist. Our buyer agent, a vendor-risk bot with a watchlist, buys it over x402: it gets a 402 Payment Required, signs a USDC authorization, and the contract escrows the payment. The oracle looks up every cited filing on CourtListener, finds none, and marks it FABRICATED. The whole bond is taken and the buyer is repaid."
- **Act 2, settlement:** "Next, a replay basket made from past cases whose outcome we already know, so it settles in minutes. The buyer checks the odds, buys, decrypts, and checks every item against the on-chain fingerprint. The oracle matches each case to justice.gov, 4 of 10 hit, the claim needed 3, so it's TRUE and the seller is paid. Replays never count toward reputation."
- **Act 3, live:** "Finally, a real basket from the last 45 days of filings, left open. A stranger asks for the key and gets refused. Sixty seconds later the exclusivity window ends and the same request succeeds. Nobody had to do anything. The information always goes public."

**2:40–3:30 · Show it on chain** *(claim/0, claim/1, ledger, BaseScan)*
> "Here's claim 0 after the slash: the bond went to the buyer and the pool. Claim 1 shows the revealed basket. Each hit is shown in full with its DOJ release, and my browser recomputes its Merkle proof against the root on chain. The ledger page draws every transaction as a graph, and it all links to BaseScan on the verified contract."

**3:30–3:55 · Agents first** *(agents page, then `/api/x402/claims` JSON)*
> "Agents are the main users. There's a JSON API, an agent manifest, an llms.txt, and x402 purchases. Sellers register an ERC-8004 identity, and the oracle writes their calibration to the reputation registry after every settlement."

**3:55–4:30 · Trust and limits** *(DESIGN.md or README)*
> "What you trust: the escrow and payouts are code. The grader is a single bonded oracle that anyone can challenge, with me as the dispute backstop, so it's not decentralized. The key server is the biggest trust assumption. It can release a key early or refuse one, but it can't fake a purchase, and Lit Protocol is the planned replacement. The biggest limitation is that grading is a title word match and the edge rests on a small sample. That's Verity: early, checkable accountability findings, bought blind and settled on chain. Thanks."
