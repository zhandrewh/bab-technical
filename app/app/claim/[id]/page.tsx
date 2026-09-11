import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClaim } from "@/lib/claims";
import { calibrationFrom } from "@/lib/calibration";
import { getAllEvents } from "@/lib/events";
import { usd, addrUrl } from "@/lib/chain";
import { fetchEnvelopeJson } from "@/lib/storage";
import { BASELINE, binomTail, fmtLift, fmtOdds, signalRate } from "@/lib/odds";
import type { BasketEvidence } from "@/lib/package";
import { Rule, Field, Panel, Stats, Tag, TxLink, Addr, brierText, outcomeTone } from "@/components/ui";
import { PurchasePanel } from "@/components/purchase-panel";
import { LiveFeed } from "@/components/feed";
import { SettlementTable } from "@/components/settlement-table";
import { KofN } from "@/components/market-cards";
import { RevealedBasket } from "@/components/revealed-basket";

export const dynamic = "force-dynamic";

const dt = (ts: number) => (ts ? new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

async function loadEvidence(uri: string | null): Promise<BasketEvidence | null> {
  if (!uri || !/^(data:|ipfs:\/\/)/.test(uri)) return null;
  try {
    return JSON.parse(await fetchEnvelopeJson(uri)) as BasketEvidence;
  } catch {
    return null;
  }
}

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { claim: c, events } = await loadClaim(id);
  if (!c) notFound();
  const cal = calibrationFrom(await getAllEvents()).get(c.seller.toLowerCase());
  const domainCal = cal?.byDomain[c.domain];
  const settled = events.find((e) => e.kind === "Settled");
  const evidence = await loadEvidence(c.evidenceURI);
  const now = Date.now() / 1000;
  const days = (c.deadline - c.committedAt) / 86_400;
  const signalOdds = binomTail(c.n, c.k, signalRate(days));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Rule left={`basket #${c.id}`} right={<Tag tone={c.status === "SETTLED" ? outcomeTone(c.outcome) : "gold"}>{c.status === "SETTLED" ? `settled ${c.outcome}` : c.status}</Tag>} />
        <p className="text-[13px] text-muted-foreground">
          <Link href="/market" className="text-gold-dim hover:text-gold">← market</Link>
        </p>
      </div>

      <div className="space-y-4">
        <h1 className="max-w-4xl text-[24px] font-semibold leading-tight sm:text-[30px]">{c.teaser}</h1>
        <KofN c={c} big />
        {c.replay && (
          <p className="max-w-3xl text-[12px] text-muted-foreground">
            Backtest replay: every item is a historical notice whose outcome is already on the record. It settles like any claim, but the contract
            leaves no seller record and the app excludes it from calibration and lift.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Sharpness first: the count is only worth paying for if a random basket would not make it. */}
          <Panel>
            <Rule left="how sharp is this claim" right={`base rates · n=${BASELINE.control.n} / ${BASELINE.treatment.n}`} />
            <div className="mt-4">
              <Stats
                big
                items={[
                  ["Claimed", `${c.k} of ${c.n}`],
                  ["Expected by chance", c.expected.toFixed(1)],
                  ["Random-basket odds", fmtOdds(c.randomOdds)],
                  ["Seller lift", c.sellerLift == null ? "no history" : fmtLift(c.sellerLift)],
                ]}
              />
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
              A random sealed FCA notice (a declined case) drew a DOJ release within this {Math.round(days)}-day window at {(c.p0 * 100).toFixed(1)}% per item in
              the backtest, so {c.n} random cases make this claim {fmtOdds(c.randomOdds)} of the time. Settlement-intervention notices ran at{" "}
              {(signalRate(days) * 100).toFixed(1)}%, which puts this claim at {fmtOdds(signalOdds)}. The seller states {Math.round(c.confidence * 100)}%.
            </p>
          </Panel>

          {evidence && <RevealedBasket evidence={evidence} itemsRoot={c.itemsRoot} k={c.k} n={c.n} />}

          {/* The blind boundary, made explicit. */}
          <Panel>
            <Rule left="what you know before paying" right="public · on chain" />
            <div className="mt-3">
              <Field k="committed" v={<>{dt(c.committedAt)} · <TxLink hash={c.commitTx} label="commit tx" /></>} hint="Permanent, timestamped, non-repudiable: this seller knew these cases, then." />
              <Field k="seller" v={<><Addr a={c.seller} /> · <a className="text-gold-dim hover:text-gold" href={addrUrl(c.seller)} target="_blank" rel="noreferrer">basescan ↗</a></>} />
              <Field k="resolver" v={c.resolver} hint="justice.gov press releases after the commit, in an FCA context, naming a sealed item's defendant. The buyer cannot resolve it." />
              <Field k="deadline" v={dt(c.deadline)} />
              <Field k="exclusivity ends" v={dt(c.exclusivityEnd)} hint={c.exclusivityEnd <= now ? "Expired — the key is open to everyone." : "Fixed at commit. Neither party can move it. After this the key opens to everyone."} />
              <Field k="price" v={<>{usd(BigInt(c.currentUpfront))} upfront <span className="text-muted-foreground">(list {usd(BigInt(c.upfront))}, decaying)</span> + {usd(BigInt(c.contingent))} contingent</>} hint={`${Math.round(c.upfrontShare * 100)}% upfront. Both tranches go into escrow when you buy; the contingent pays out only if at least ${c.k} hit and the basket is public.`} />
              <Field k="bond" v={<><span className="text-gold">{usd(BigInt(c.bond))}</span> · {c.bondMultiple}× upfront</>} hint={`Fewer than ${c.k} hit: ${usd(BigInt(c.bond) / 2n)} slashed. Fabricated docket citation: all ${usd(BigInt(c.bond))} slashed, you are made whole first.`} />
              <Field k="seller calibration" v={<>Brier {brierText(cal?.brier ?? null)} overall · {domainCal ? `${brierText(domainCal.brier)} in ${c.domain} (${domainCal.n})` : `no history in ${c.domain}`}</>} hint="Stated confidence vs outcome. Lower is better; 0.25 is a coin flip." />
              <Field k="items root" v={<code className="text-[12px] text-gold">{c.itemsRoot}</code>} hint="Merkle root over the salted items. Binds which cases, so the seller cannot swap them after the fact." />
              <Field k="payload hash" v={<code className="text-[12px] text-gold">{c.payloadHash}</code>} hint="keccak256 of the encrypted envelope. A mismatch at resolution is fabrication." />
              <Field k="storage" v={c.payloadURI.startsWith("ipfs://") ? c.payloadURI : "ciphertext in commit calldata"} />
              <Field k="duplicates" v={c.novelty > 0 ? <span className="text-danger">{c.novelty} prior open commit(s) touch overlapping entities</span> : "no overlapping open commits"} hint="Catches set-splitting and baskets the market already holds." />
            </div>
          </Panel>

          <Panel>
            <Rule left="sealed · what you are buying blind" tone="dim" right="aes-256-gcm" />
            <div className="mt-3 select-none break-all font-mono text-[12px] leading-relaxed text-gold-faint">
              {c.payloadHash.slice(2).repeat(6)}
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Which {c.n} cases: defendant, court, docket number, the cited notice, and the seller&apos;s analysis. Delivered by the key-release layer, never by the seller.
            </p>
          </Panel>

          {settled && <SettlementTable e={settled} slashed={events.find((e) => e.kind === "Slashed")} />}

          <div className="space-y-3">
            <Rule left="history" right="from the event log" />
            <LiveFeed initial={[...events].reverse()} claimId={c.id} />
          </div>
        </div>

        <div className="space-y-4">
          <PurchasePanel claim={c} />
        </div>
      </div>
    </div>
  );
}
