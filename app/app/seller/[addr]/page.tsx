import Link from "next/link";
import { getAllEvents } from "@/lib/events";
import { calibrationFrom } from "@/lib/calibration";
import { publicClient, MARKET, usd, addrUrl, REPUTATION_REGISTRY } from "@/lib/chain";
import { marketAbi } from "@/lib/abi";
import { Rule, Panel, Tag, TxLink, brierText, outcomeTone } from "@/components/ui";
import type { Address } from "viem";

export const dynamic = "force-dynamic";

export default async function SellerPage({ params }: { params: Promise<{ addr: string }> }) {
  const { addr } = await params;
  const events = await getAllEvents();
  const cal = calibrationFrom(events).get(addr.toLowerCase());
  const rec = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getSellerRecord", args: [addr as Address] }).catch(() => null);
  const open = events.filter((e) => e.kind === "Committed" && (e.args.seller as string).toLowerCase() === addr.toLowerCase() && !events.some((s) => s.kind === "Settled" && s.claimId === e.claimId));

  return (
    <div className="space-y-8">
      <Rule left="seller" right={<a href={addrUrl(addr)} target="_blank" rel="noreferrer" className="hover:text-gold">{addr} ↗</a>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["brier", brierText(cal?.brier ?? null)],
          ["settled", String(rec?.settled ?? 0)],
          ["true / false / fab", `${rec?.resolvedTrue ?? 0} / ${rec?.resolvedFalse ?? 0} / ${rec?.fabricated ?? 0}`],
          ["bonds posted", usd(rec?.bondsPosted ?? 0n)],
          ["bonds slashed", usd(rec?.bondsSlashed ?? 0n)],
        ].map(([k, v]) => (
          <Panel key={k} className="text-center">
            <div className="label">{k}</div>
            <div className={`mt-1 text-xl font-semibold ${k === "bonds slashed" && (rec?.bondsSlashed ?? 0n) > 0n ? "text-danger" : "text-gold"}`}>{v}</div>
          </Panel>
        ))}
      </div>

      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        Reputation is a published calibration history, not a star rating: what this seller said the odds were, and what happened. Brier score is
        the mean squared gap between stated confidence and outcome — 0 is perfect, 0.25 is a coin flip. Computed from the on-chain event log;
        aggregate feedback is pushed to the ERC-8004 Reputation Registry at <a className="text-gold-dim hover:text-gold" href={addrUrl(REPUTATION_REGISTRY)} target="_blank" rel="noreferrer">{REPUTATION_REGISTRY.slice(0, 10)}… ↗</a>.
      </p>

      <section className="space-y-3">
        <Rule left="by domain" />
        <div className="flex flex-wrap gap-3">
          {Object.entries(cal?.byDomain ?? {}).map(([d, v]) => (
            <Panel key={d}><div className="label">{d}</div><div className="mt-1 text-gold">{brierText(v.brier)} <span className="text-[11px] text-muted-foreground">n={v.n}</span></div></Panel>
          ))}
          {!cal?.n && <p className="text-[13px] text-muted-foreground">No settled claims yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <Rule left="prediction history" right={`${cal?.n ?? 0} settled · ${open.length} open`} />
        <div className="glass bab-scroll overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left">
                {["claim", "domain", "predicted", "actual", "(p−o)²", "bond", "slashed", "settled", "tx"].map((h) => <th key={h} className="px-3 py-3 text-[12px] font-medium text-muted-foreground first-letter:uppercase">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {cal?.history.map((p) => (
                <tr key={p.claimId}>
                  <td className="px-3 py-2"><Link className="text-gold hover:underline" href={`/claim/${p.claimId}`}>#{p.claimId}</Link></td>
                  <td className="px-3 py-2 text-gold-dim">{p.domain}</td>
                  <td className="px-3 py-2">{Math.round(p.predicted * 100)}%</td>
                  <td className="px-3 py-2"><Tag tone={outcomeTone(p.outcome)}>{p.outcome}</Tag></td>
                  <td className="px-3 py-2">{((p.predicted - p.actual) ** 2).toFixed(3)}</td>
                  <td className="px-3 py-2">{usd(BigInt(p.bond))}</td>
                  <td className={`px-3 py-2 ${p.slashed !== "0" ? "text-danger" : "text-muted-foreground"}`}>{usd(BigInt(p.slashed))}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(p.settledAt * 1000).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2"><TxLink hash={p.tx} /></td>
                </tr>
              ))}
              {open.map((e) => (
                <tr key={e.claimId} className="text-muted-foreground">
                  <td className="px-3 py-2"><Link className="text-gold-dim hover:underline" href={`/claim/${e.claimId}`}>#{e.claimId}</Link></td>
                  <td className="px-3 py-2" colSpan={2}>{Math.round(Number(e.args.confidenceBps) / 100)}% · pending</td>
                  <td className="px-3 py-2" colSpan={6}>awaiting resolution</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
