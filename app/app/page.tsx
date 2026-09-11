import Link from "next/link";
import type { FeedEvent } from "@/lib/events";
import { loadMarket, type ClaimView } from "@/lib/claims";
import { LiveFeed } from "@/components/feed";
import { FeaturedClaim, MarketCards } from "@/components/market-cards";
import { Rule, Panel, ErrorNote, btnBase, btnVariant } from "@/components/ui";
import { MARKET, usd, addrUrl } from "@/lib/chain";

export const dynamic = "force-dynamic";

export default async function Home() {
  let events: FeedEvent[] = [];
  let claims: ClaimView[] = [];
  let error = "";
  try {
    const m = await loadMarket();
    claims = m.claims;
    events = m.events.slice(-200).reverse();
  } catch (e) {
    error = (e as Error).message;
  }
  const sum = (k: string, f: string) => events.filter((e) => e.kind === k).reduce((a, e) => a + BigInt(e.args[f] as string), 0n);
  const openCount = claims.filter((c) => c.status === "OPEN").length;
  const buyers = events.filter((e) => e.kind === "Purchased").length;

  return (
    <div className="space-y-12">
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        <FeaturedClaim claims={claims} />
        <aside className="flex flex-col gap-4">
          <Panel tone="gold" className="space-y-3">
            <h1 className="font-serif text-[30px] leading-none text-foreground">verity</h1>
            <p className="text-[13px] leading-relaxed text-foreground/85">
              Buy sealed findings about government and contractor failures — before they’re public. Sellers put up a bond, so
              <span className="text-gold"> wrong answers cost them, not you</span>.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Link href="/market" className={`${btnBase} ${btnVariant.primary} py-2.5`}>
                Browse {openCount || ""} open markets →
              </Link>
              <Link href="/commit" className={`${btnBase} ${btnVariant.idle} py-2.5`}>
                Sell a finding
              </Link>
            </div>
          </Panel>
          <div className="grid flex-1 grid-cols-2 gap-3">
            {[
              ["Open markets", String(openCount), false],
              ["Purchases", String(buyers), false],
              ["In escrow", usd(sum("Purchased", "contingentEscrowed")), false],
              ["Bonds slashed", usd(sum("Slashed", "amount")), sum("Slashed", "amount") > 0n],
            ].map(([k, v, bad]) => (
              <div key={k as string} className="glass flex flex-col justify-center rounded-2xl px-4 py-3">
                <div className="text-[11px] text-muted-foreground">{k}</div>
                <div className={`mt-0.5 text-[18px] font-semibold ${bad ? "text-danger" : "text-foreground"}`}>{v}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="space-y-4">
        <Rule left="markets" right={<Link href="/market" className="hover:text-gold">Advanced filters →</Link>} />
        <MarketCards claims={claims} />
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Rule left="recent activity" right={<a href={addrUrl(MARKET)} target="_blank" rel="noreferrer" className="hover:text-gold">contract ↗</a>} />
          <LiveFeed initial={events.slice(0, 12)} limit={12} compact />
        </div>
        <div className="space-y-4">
          <Rule left="how it works" right={<Link href="/how" className="hover:text-gold">Full walkthrough →</Link>} />
          <ol className="space-y-3">
            {[
              ["Pick a market", "Every finding shows who can prove it, the deadline, the seller's bond and their track record — before you pay."],
              ["Buy it blind", "Pay the upfront price to unlock the evidence. The rest waits in escrow until the finding goes public."],
              ["Get settled", "An independent institution resolves it. False claims slash the seller's bond and refund buyers."],
            ].map(([h, b], i) => (
              <li key={h} className="glass flex gap-3 rounded-2xl p-4">
                <span className="glass-gold grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-gold">{i + 1}</span>
                <div>
                  <div className="text-[14px] font-medium">{h}</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
