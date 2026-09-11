import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClaim } from "@/lib/claims";
import { calibrationFrom } from "@/lib/calibration";
import { getAllEvents } from "@/lib/events";
import { usd, addrUrl } from "@/lib/chain";
import { Rule, Field, Panel, Tag, TxLink, Addr, brierText, outcomeTone } from "@/components/ui";
import { PurchasePanel } from "@/components/purchase-panel";
import { LiveFeed } from "@/components/feed";
import { SettlementTable } from "@/components/settlement-table";

export const dynamic = "force-dynamic";

const dt = (ts: number) => (ts ? new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { claim: c, events } = await loadClaim(id);
  if (!c) notFound();
  const cal = calibrationFrom(await getAllEvents()).get(c.seller.toLowerCase());
  const domainCal = cal?.byDomain[c.domain];
  const settled = events.find((e) => e.kind === "Settled");
  const now = Date.now() / 1000;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Rule left={`claim #${c.id}`} right={<Tag tone={c.status === "SETTLED" ? outcomeTone(c.outcome) : "gold"}>{c.status === "SETTLED" ? `settled ${c.outcome}` : c.status}</Tag>} />
        <p className="text-[13px] text-muted-foreground">
          <Link href="/market" className="text-gold-dim hover:text-gold">← market</Link>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* The blind boundary, made explicit. */}
          <Panel tone="gold">
            <Rule left="what you know before paying" right="public · on chain" />
            <div className="mt-3">
              <Field k="committed" v={<>{dt(c.committedAt)} · <TxLink hash={c.commitTx} label="commit tx" /></>} hint="Permanent, timestamped, non-repudiable: this seller knew this, then." />
              <Field k="seller" v={<><Addr a={c.seller} /> · <a className="text-gold-dim hover:text-gold" href={addrUrl(c.seller)} target="_blank" rel="noreferrer">basescan ↗</a></>} />
              <Field k="resolver" v={c.resolver} hint="Whitelisted institution indifferent to this contract. The buyer cannot resolve it." />
              <Field k="deadline" v={dt(c.deadline)} />
              <Field k="exclusivity ends" v={dt(c.exclusivityEnd)} hint={c.exclusivityEnd <= now ? "Expired — the key is open to everyone." : "Fixed at commit. Neither party can move it. After this the key opens to everyone."} />
              <Field k="price" v={<>{usd(BigInt(c.currentUpfront))} upfront <span className="text-muted-foreground">(list {usd(BigInt(c.upfront))}, decaying)</span> + {usd(BigInt(c.contingent))} contingent</>} hint={`${Math.round(c.upfrontShare * 100)}% upfront. Both tranches go into escrow when you buy; the contingent pays out only if the claim resolves true and public.`} />
              <Field k="bond" v={<><span className="text-gold">{usd(BigInt(c.bond))}</span> · {c.bondMultiple}× upfront</>} hint={`False: ${usd(BigInt(c.bond) / 2n)} slashed. Fabricated: all ${usd(BigInt(c.bond))} slashed, you are made whole first.`} />
              <Field k="seller confidence" v={`${Math.round(c.confidence * 100)}%`} hint="Scored against the outcome — feeds the seller's Brier score." />
              <Field k="seller calibration" v={<>Brier {brierText(cal?.brier ?? null)} overall · {domainCal ? `${brierText(domainCal.brier)} in ${c.domain} (${domainCal.n})` : `no history in ${c.domain}`}</>} hint="Lower is better. 0.25 is a coin flip." />
              <Field k="claim hash" v={<code className="text-[12px] text-gold">{c.claimHash}</code>} />
              <Field k="payload hash" v={<code className="text-[12px] text-gold">{c.payloadHash}</code>} hint="keccak256 of the encrypted envelope. A mismatch at resolution is fabrication." />
              <Field k="storage" v={c.payloadURI.startsWith("ipfs://") ? c.payloadURI : "ciphertext in commit calldata"} />
              <Field k="duplicates" v={c.novelty > 0 ? <span className="text-danger">{c.novelty} prior open commit(s) touch overlapping entities</span> : "no overlapping open commits"} hint="Catches set-splitting and claims the market already holds." />
            </div>
          </Panel>

          <Panel>
            <Rule left="sealed · what you are buying blind" tone="dim" right="aes-256-gcm" />
            <div className="mt-3 select-none break-all font-mono text-[12px] leading-relaxed text-gold-faint">
              {c.payloadHash.slice(2).repeat(6)}
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground">The claim text, the evidence trail, and the sources. Delivered by the key-release layer, never by the seller.</p>
          </Panel>

          {settled && <SettlementTable e={settled} slashed={events.find((e) => e.kind === "Slashed")} />}

          <div className="space-y-3">
            <Rule left="history" right="from the event log" />
            <LiveFeed initial={[...events].reverse()} filter={(e) => e.claimId === c.id} />
          </div>
        </div>

        <div className="space-y-4">
          <PurchasePanel claim={c} />
        </div>
      </div>
    </div>
  );
}
