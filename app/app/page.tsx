import Link from "next/link";
import { getAllEvents, type FeedEvent } from "@/lib/events";
import { LiveFeed } from "@/components/feed";
import { Eyebrow, Rule, Panel } from "@/components/ui";
import { MARKET, usd, addrUrl } from "@/lib/chain";

export const dynamic = "force-dynamic";

export default async function Home() {
  let events: FeedEvent[] = [];
  let error = "";
  try {
    events = (await getAllEvents()).slice(-200).reverse();
  } catch (e) {
    error = (e as Error).message;
  }
  const count = (k: string) => events.filter((e) => e.kind === k).length;
  const slashed = events.filter((e) => e.kind === "Slashed").reduce((a, e) => a + BigInt(e.args.amount as string), 0n);
  const escrowed = events.filter((e) => e.kind === "Purchased").reduce((a, e) => a + BigInt(e.args.contingentEscrowed as string), 0n);

  return (
    <div className="space-y-12">
      <section className="space-y-6 pt-10 text-center">
        <Eyebrow>blockchain at berkeley</Eyebrow>
        <h1 className="font-serif text-6xl leading-none tracking-tight text-foreground sm:text-7xl">verity</h1>
        <p className="mx-auto max-w-2xl text-[14px] leading-relaxed text-foreground/85">
          A market where people who spot government and contractor failures in public records get paid for being
          <span className="text-gold"> early and right</span> — and paid in full only if the finding
          <span className="text-gold"> reaches the public</span>.
        </p>
        <p className="mx-auto max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          The Truth API sells a manufactured window: information that would be instantly public, withheld from non-payers.
          Verity sells a discovered window: facts sitting unread in public records, sold on the condition that they become public.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/market" className="border border-gold-dim px-3 py-1.5 text-[11px] uppercase tracking-widest text-gold transition-colors hover:bg-gold hover:text-background">
            [ browse sealed claims ]
          </Link>
          <Link href="/commit" className="border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest text-gold-dim transition-colors hover:border-gold hover:text-gold">
            [ commit a finding ]
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["claims sealed", count("Committed")],
          ["blind purchases", count("Purchased")],
          ["contingent escrowed", usd(escrowed)],
          ["bonds slashed", usd(slashed)],
        ].map(([k, v]) => (
          <Panel key={k as string} className="text-center">
            <div className="label">{k}</div>
            <div className={`mt-1 text-lg ${k === "bonds slashed" && slashed > 0n ? "text-danger" : "text-gold"}`}>{v}</div>
          </Panel>
        ))}
      </section>

      <section className="space-y-3">
        <Rule left="live settlement feed" right={<a href={addrUrl(MARKET)} target="_blank" rel="noreferrer" className="hover:text-gold">market {MARKET.slice(0, 8)}… ↗</a>} />
        {error && <Panel tone="danger"><span className="text-[11px] uppercase tracking-widest text-danger">[error]</span> <span className="text-[13px]">{error}</span></Panel>}
        <LiveFeed initial={events} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["1 · commit", "The seller encrypts the evidence and puts its hash, the claim hash, the resolver and a bond on chain. That record — this person knew this, then — is why Verity is on a chain."],
          ["2 · buy blind", "The buyer sees resolver, deadline, bond, calibration and an overlap count. Both tranches go into escrow. The key releases on chain state; the seller is not in the path."],
          ["3 · settle", "An institution indifferent to the contract resolves it. True and public pays the seller. True and suppressed pays the public-goods pool. False slashes the bond."],
        ].map(([h, b]) => (
          <Panel key={h}>
            <div className="text-[11px] uppercase tracking-widest text-gold">{h}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">{b}</p>
          </Panel>
        ))}
      </section>
    </div>
  );
}
