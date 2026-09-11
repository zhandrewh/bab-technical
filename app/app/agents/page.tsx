// Agents first. Everything a person can do in the UI is one HTTP call for a program, and the page proves it with the
// live log: purchases relayed over x402, proposals and settlements made by the oracle agent, baskets sealed by sellers.
import Link from "next/link";
import { privateKeyToAccount } from "viem/accounts";
import { loadMarket } from "@/lib/claims";
import type { FeedEvent } from "@/lib/events";
import { MARKET, BIDS, addrUrl, usd } from "@/lib/chain";
import { AgentHandshake } from "@/components/agent-handshake";
import { Rule, Panel, Stats, TxLink, btnBase, btnVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

const Code = ({ children, title }: { children: string; title?: string }) => (
  <div className="surface overflow-hidden rounded-md">
    {title && <div className="border-b border-border px-4 py-2 font-mono text-[11px] text-muted-foreground">{title}</div>}
    <pre className="bab-scroll overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-foreground/90">{children}</pre>
  </div>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-sm bg-white/[0.06] px-1 py-0.5 font-mono text-[12px] text-gold">{children}</code>
);

const OUT = ["NONE", "TRUE", "FALSE", "FABRICATED"];
const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

function relayerAddress(): string | undefined {
  try {
    return process.env.RELAYER_PK ? privateKeyToAccount(process.env.RELAYER_PK as `0x${string}`).address : undefined;
  } catch {
    return undefined;
  }
}

export default async function AgentsPage() {
  let events: FeedEvent[] = [];
  let openCount = 0;
  try {
    const m = await loadMarket();
    events = m.events;
    openCount = m.claims.filter((c) => c.status === "OPEN").length;
  } catch {}
  const relayer = relayerAddress();
  const x402 = events.filter((e) => e.kind === "Purchased" && relayer && String(e.args.payer).toLowerCase() === relayer.toLowerCase());
  const oracle = events.filter((e) => e.kind === "Proposed" || e.kind === "Settled");
  const commits = events.filter((e) => e.kind === "Committed");
  const activity = [...x402, ...oracle, ...commits].sort((a, b) => b.ts - a.ts || b.logIndex - a.logIndex).slice(0, 8);
  const line = (e: FeedEvent) => {
    const a = e.args;
    const id = <Link href={`/claim/${e.claimId}`} className="text-gold hover:underline">#{e.claimId}</Link>;
    if (e.kind === "Purchased") return <>buyer agent bought {id} over x402 for {usd(BigInt(a.upfrontPaid as string) + BigInt(a.contingentEscrowed as string))}; relayer called purchaseFor</>;
    if (e.kind === "Proposed") return <>oracle agent proposed {id} = {OUT[Number(a.outcome)]} with a bond and evidence</>;
    if (e.kind === "Settled") return <>oracle agent settled {id} {OUT[Number(a.outcome)]} after the challenge window</>;
    return <>seller agent sealed {id}: “{String(a.teaser)}”, bond {usd(BigInt(a.bond as string))}</>;
  };

  return (
    <div className="space-y-12">
      <header className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-end">
        <div className="max-w-2xl space-y-3">
          <h1 className="font-serif text-[40px] leading-none text-foreground sm:text-[52px]">Instructions</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            The website is wrapped around an API, where a program / agent can discover, purchase, recieve, and verify.

          </p>
        </div>
      </header>

      <section className="space-y-4">
        <Rule left="agents on the ledger now" right={<Link href="/ledger" className="hover:text-gold">full ledger →</Link>} />
        {activity.length ? (
          <ul className="surface divide-y divide-white/[0.06] overflow-hidden rounded-md">
            {activity.map((e) => (
              <li key={`${e.tx}:${e.logIndex}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-[13px]">
                <span className="min-w-0 truncate text-foreground/90">{line(e)}</span>
                <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {ago(e.ts)} · <TxLink hash={e.tx} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface rounded-md px-5 py-6 text-[13px] text-muted-foreground">
            No agent activity indexed yet. Run <Mono>npm run demo</Mono> against this deployment and it will fill in within a block.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <Rule left="the buy, hop by hop" right="x402 · EIP-3009 · purchaseFor · canDecrypt" />
        <Panel>
          <AgentHandshake />
        </Panel>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          The 402 quotes exactly what the contract would charge a wallet: <Mono>currentPrice(id)</Mono>, read from chain. The agent signs a USDC
          authorization, the facilitator settles it, and the relayer calls <Mono>purchaseFor(id, agent)</Mono>, so on the ledger an agent purchase is
          indistinguishable from a wallet purchase. The key request is a signature, not a transaction, and it succeeds only because{" "}
          <Mono>canDecrypt(id, agent)</Mono> reads true. Nothing in this path asks the seller for anything.
        </p>
      </section>

      <section className="space-y-4">
        <Rule left="three agents, all forkable" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              role: "Seller agent",
              file: "scripts/seller-fca.ts",
              cmd: "npm run seller",
              does: "Searches CourtListener for notices that the United States will intervene in a sealed False Claims Act case to settle it. Drops cases DOJ already announced. Picks the largest k its backtested hit rate supports, salts and merklizes the items, encrypts to the key layer, and commits with a bond.",
              point: "Point findNotices and toItem at any public list with a whitelisted resolver and it sells something else.",
            },
            {
              role: "Buyer agent",
              file: "scripts/buyer-vendorrisk.ts",
              cmd: "npm run buyer -- <id>",
              does: "A compliance team's diligence bot with a vendor watchlist that never leaves the process. It intersects the watchlist with each basket's Bloom filter locally, buys only if the random-basket odds are under 5% and the seller is bonded or proven, pays over x402, then decrypts and verifies the hash and the root.",
              point: "Replace the watchlist and the buy rule. The payment and key code stays.",
            },
            {
              role: "Oracle agent",
              file: "scripts/oracle.ts",
              cmd: "npm run oracle",
              does: "A permissionless bonded proposer. It reads the sealed basket through the same key layer buyers use, verifies every leaf against the committed root and every cited docket entry, checks each item against justice.gov, proposes an outcome with a hit mask and evidence, and settles after the challenge window.",
              point: "Anyone can run one. A wrong proposal can be disputed by anyone with a matching bond.",
            },
          ].map((r) => (
            <div key={r.role} className="flex flex-col border-t border-border pt-4">
              <div className="text-[15px] font-medium text-foreground">{r.role}</div>
              <div className="mt-1 font-mono text-[11px] text-gold-dim">{r.file}</div>
              <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">{r.does}</p>
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{r.point}</p>
              <div className="mt-auto pt-4">
                <Mono>{r.cmd}</Mono>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Rule left="buy from a script" right="x402-fetch · viem" />
        <Code title="buy.ts">{`import { wrapFetchWithPayment } from "x402-fetch";
import { keyRequestMessage } from "./lib/keyRelease";

const pay = wrapFetchWithPayment(fetch, walletClient);            // viem wallet on base-sepolia
const { claims } = await (await fetch("https://<host>/api/x402/claims?status=OPEN")).json();
const pick = claims.find((c) => c.randomOdds < 0.05 && (c.sellerLift ?? 0) >= 3);

const bought = await (await pay(pick.buy)).json();                 // 402 -> sign -> settle -> purchaseFor
console.log(bought.purchaseTx);

const issuedAt = Math.floor(Date.now() / 1000);
const signature = await walletClient.signMessage({ message: keyRequestMessage(BigInt(pick.id), issuedAt) });
const { key } = await (await fetch(pick.key, {
  method: "POST", body: JSON.stringify({ address: walletClient.account.address, signature, issuedAt }) })).json();
// decrypt pick.payloadURI with key; check keccak256(envelope) == pick.payloadHash and the Merkle root == pick.itemsRoot`}</Code>
      </section>

      <section className="space-y-4">
        <Rule left="endpoints" />
        <div className="surface bab-scroll overflow-x-auto rounded-md">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-4 py-3 font-medium">call</th>
                <th className="px-4 py-3 font-medium">auth</th>
                <th className="px-4 py-3 font-medium">what comes back</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[
                ["GET /api/x402/claims?status=OPEN", "none", "every listing: n, k, teaser, random-basket odds, expected by chance, seller lift, bond multiple, current price, Bloom filter, itemsRoot, payloadHash, payloadURI, and its preview / buy / key URLs"],
                ["GET /api/x402/claims/:id/preview", "none", "the Bloom filter and its parameters; add ?beat=a,b,c to let the server count for you (the seller never sees it)"],
                ["GET /api/x402/claims/:id/buy", "x402", "402 with accepts[] until X-PAYMENT is present; then paymentTx, purchaseTx and what to do next"],
                ["POST /api/key/:id", "signature", "{ key, reason } iff canDecrypt(id, address). 403 before purchase, 200 for anyone after exclusivity ends"],
                ["GET /api/feed", "none", "the event log the live feed and the ledger render"],
                ["GET /api/agents", "none", "this market as JSON: contracts, endpoints, payment scheme, key-request message, what to verify"],
              ].map(([c, a, r]) => (
                <tr key={c}>
                  <td className="px-4 py-3 font-mono text-[12px] text-gold">{c}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a}</td>
                  <td className="px-4 py-3 text-foreground/85">{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel tone="gold" className="space-y-3">
          <Rule left="discovery" />
          <p className="text-[13px] leading-relaxed text-foreground/85">
            An agent that has only the hostname can find everything else. The manifest lists the contracts, every endpoint, the payment scheme,
            the exact key-request message and the checks to run locally.
          </p>
          <ul className="space-y-1.5 text-[13px]">
            <li><a className="text-gold hover:underline" href="/api/agents">/api/agents</a> <span className="text-muted-foreground">JSON manifest</span></li>
            <li><a className="text-gold hover:underline" href="/.well-known/agent.json">/.well-known/agent.json</a> <span className="text-muted-foreground">the same, at the conventional path</span></li>
            <li><a className="text-gold hover:underline" href="/llms.txt">/llms.txt</a> <span className="text-muted-foreground">the market in one screen, for a language model</span></li>
          </ul>
        </Panel>
        <Panel className="space-y-3">
          <Rule left="what an agent never has to trust us for" />
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-foreground/85">
            <li>The 402 amount equals <Mono>currentPrice(id)</Mono> on chain.</li>
            <li>After paying, <Mono>purchased(id, you)</Mono> reads true from any RPC.</li>
            <li>The envelope hashes to the committed <Mono>payloadHash</Mono>.</li>
            <li>The decrypted items hash to the committed <Mono>itemsRoot</Mono>.</li>
            <li>After the window, <Mono>canDecrypt(id, anyone)</Mono> is true and the key is public.</li>
          </ul>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            What it does have to trust: the v1 key custodian, which can release early or refuse but cannot forge a purchase; and the oracle,
            which is bonded and disputable. Both are stated in DESIGN.md.
          </p>
        </Panel>
      </section>

      <section className="space-y-3">
        <Rule left="run the whole market from a terminal" />
        <Code title="cd app">{`npm run seller                   # seal a live basket from the last 45 days of docket notices
npm run seller -- --replay       # a backtest basket that settles on history in minutes
npm run buyer -- 0               # vendor-risk agent: odds + watchlist, x402 buy, decrypt, verify
npm run oracle                   # bonded proposer: verify root and dockets, propose a hit mask, settle
npm run demo                     # all of it, from cold: the slash first, then the happy path`}</Code>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href="/market" className={`${btnBase} ${btnVariant.primary}`}>
            {openCount ? `${openCount} open baskets to buy` : "See the market"}
          </Link>
          <span className="text-[12px] text-muted-foreground">
            VerityMarket <a className="text-gold-dim hover:text-gold" href={addrUrl(MARKET)} target="_blank" rel="noreferrer">{MARKET.slice(0, 10)}… ↗</a>
            <span className="mx-2">·</span>
            StandingBids <a className="text-gold-dim hover:text-gold" href={addrUrl(BIDS)} target="_blank" rel="noreferrer">{BIDS.slice(0, 10)}… ↗</a>
          </span>
        </div>
      </section>
    </div>
  );
}
