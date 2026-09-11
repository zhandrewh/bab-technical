import { Rule, Panel } from "@/components/ui";
import { MARKET, BIDS, addrUrl } from "@/lib/chain";

const Code = ({ children }: { children: string }) => (
  <div className="glass overflow-hidden rounded-3xl">
    <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" />
    </div>
    <pre className="bab-scroll overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-foreground/90">{children}</pre>
  </div>
);

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <Rule left="agent surface" right="x402 · no browser" />
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        Everything in the UI is available over HTTP so an agent can list, preview and buy with no UI. Payment is x402: the endpoint answers
        <code className="mx-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[12px] text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">402 Payment Required</code>
        with the claim&apos;s current price; the agent signs a USDC authorization; the facilitator settles; the relayer calls
        <code className="mx-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[12px] text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">purchaseFor(claimId, buyer)</code>
        so both tranches land in escrow exactly as a wallet purchase would.
      </p>

      <section className="space-y-3">
        <Rule left="endpoints" />
        <Panel>
          <ul className="space-y-2 text-[13px]">
            <li><span className="text-gold">GET /api/x402/claims</span> — all listings: teaser, n, k, random-basket odds, expected by chance, seller lift, bond, Bloom filter</li>
            <li><span className="text-gold">GET /api/x402/claims/:id/preview</span> — Bloom parameters, duplicate warnings; intersect locally</li>
            <li><span className="text-gold">GET /api/x402/claims/:id/buy</span> — x402-gated purchase of both tranches</li>
            <li><span className="text-gold">POST /api/key/:id</span> — signed key request; released iff <code className="text-gold-dim">canDecrypt(id, you)</code></li>
            <li><span className="text-gold">GET /api/feed</span> — the event log the live feed renders</li>
          </ul>
        </Panel>
      </section>

      <section className="space-y-3">
        <Rule left="buy from a script" />
        <Code>{`import { wrapFetchWithPayment } from "x402-fetch";
const pay = wrapFetchWithPayment(fetch, walletClient);        // viem wallet on base-sepolia
const res = await pay("https://<host>/api/x402/claims/0/buy");  // 402 -> sign -> settle -> purchaseFor
const { purchaseTx } = await res.json();

const issuedAt = Math.floor(Date.now() / 1000);
const signature = await walletClient.signMessage({ message: keyRequestMessage(0n, issuedAt) });
const { key } = await (await fetch("https://<host>/api/key/0", {
  method: "POST", body: JSON.stringify({ address, signature, issuedAt }) })).json();`}</Code>
      </section>

      <section className="space-y-3">
        <Rule left="fork the seller agent" />
        <Panel>
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <code className="text-gold">app/scripts/seller-fca.ts</code> is the reference docket reader: it searches RECAP for notices that the
            United States will intervene in a sealed False Claims Act case for purposes of settlement, drops cases DOJ has already announced,
            builds a salted basket, picks the largest <em>k</em> its backtested hit rate supports, merklizes, encrypts and commits — no human in the loop.
            Replace <code className="text-gold-dim">findNotices</code> and <code className="text-gold-dim">toItem</code> to point it at another list with
            a public resolver.
          </p>
        </Panel>
        <Code>{`cd app && npm run seller                   # live basket from the last 45 days of notices
npm run seller -- --replay                 # backtest basket on DOJ_FCA_REPLAY (settles on history)
npm run buyer -- 0                         # vendor-risk agent: odds + watchlist check, x402 buy, decrypt
npm run oracle                             # bonded proposer: verify root + dockets, propose hitMask, settle
npm run demo                               # the whole thing, slash first`}</Code>
      </section>

      <section className="space-y-2 text-[12px] text-muted-foreground">
        <div>VerityMarket <a className="text-gold-dim hover:text-gold" href={addrUrl(MARKET)} target="_blank" rel="noreferrer">{MARKET} ↗</a></div>
        <div>StandingBids <a className="text-gold-dim hover:text-gold" href={addrUrl(BIDS)} target="_blank" rel="noreferrer">{BIDS} ↗</a></div>
      </section>
    </div>
  );
}
