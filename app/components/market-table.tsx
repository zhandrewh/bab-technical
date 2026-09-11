"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClaimView } from "@/lib/claims";
import { usd } from "@/lib/chain";
import { fmtLift, fmtOdds } from "@/lib/odds";
import { Tag, outcomeTone } from "./ui";

const inputCls = "field rounded px-3 py-1.5 text-[13px] outline-none";
const until = (ts: number) => {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "passed";
  return s < 3600 ? `${Math.ceil(s / 60)}m` : s < 86400 * 2 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

export function MarketTable({ claims }: { claims: ClaimView[] }) {
  const [status, setStatus] = useState("OPEN");
  const [resolver, setResolver] = useState("");
  const [domain, setDomain] = useState("");
  const [maxOdds, setMaxOdds] = useState("");
  const [minLift, setMinLift] = useState("");
  const [minBond, setMinBond] = useState("");

  const rows = useMemo(
    () =>
      claims.filter(
        (c) =>
          (!status || c.status === status) &&
          (!resolver || c.resolver === resolver) &&
          (!domain || c.domain.includes(domain.toLowerCase())) &&
          (!maxOdds || c.randomOdds * 100 <= Number(maxOdds)) &&
          (!minLift || (c.sellerLift != null && c.sellerLift >= Number(minLift))) &&
          (!minBond || c.bondMultiple >= Number(minBond)),
      ),
    [claims, status, resolver, domain, maxOdds, minLift, minBond],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="label">status</span>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">all</option>
            {["OPEN", "PROPOSED", "DISPUTED", "SETTLED"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">resolver</span>
          <select className={inputCls} value={resolver} onChange={(e) => setResolver(e.target.value)}>
            <option value="">any</option>
            {["DOJ_FCA", "DOJ_FCA_REPLAY"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">domain</span>
          <select className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">any</option>
            {[...new Set(claims.map((c) => c.domain))].sort().map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">random odds ≤ %</span>
          <input className={`${inputCls} w-20`} placeholder="5" value={maxOdds} onChange={(e) => setMaxOdds(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="label">seller lift ≥ ×</span>
          <input className={`${inputCls} w-16`} placeholder="3" value={minLift} onChange={(e) => setMinLift(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="label">bond ≥ ×</span>
          <input className={`${inputCls} w-16`} placeholder="5" value={minBond} onChange={(e) => setMinBond(e.target.value)} />
        </label>
      </div>

      <div className="surface bab-scroll overflow-x-auto rounded-md">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              {["basket", "k / n", "by chance", "random odds", "deadline", "upfront / contingent", "bond", "seller lift", "decayed ask", "novelty", "status"].map((h) => (
                <th key={h} className="px-3 py-3 text-[12px] font-medium text-muted-foreground first-letter:uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No baskets match. Loosen a filter, or post a standing bid so sellers come to you.</td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-white/[0.04]">
                <td className="max-w-[20rem] px-3 py-2">
                  <Link href={`/claim/${c.id}`} className="line-clamp-2 text-gold hover:underline">#{c.id} {c.teaser}</Link>
                  <div className="text-[11px] text-muted-foreground">{c.resolver}{c.replay && " · backtest replay"}</div>
                </td>
                <td className="px-3 py-2">
                  {c.k} / {c.n}
                  {c.status === "SETTLED" && c.outcome !== "FABRICATED" && <div className="text-[11px] text-muted-foreground">{c.hits} hit</div>}
                </td>
                <td className="px-3 py-2">{c.expected.toFixed(1)}</td>
                <td className="px-3 py-2 text-gold">{fmtOdds(c.randomOdds)}</td>
                <td className="px-3 py-2">{until(c.deadline)}</td>
                <td className="px-3 py-2">
                  {usd(BigInt(c.upfront))} / {usd(BigInt(c.contingent))}
                  <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-border"><div className="h-1 rounded-full bg-gold-dim" style={{ width: `${c.upfrontShare * 100}%` }} /></div>
                  <div className="text-[11px] text-muted-foreground">{Math.round(c.upfrontShare * 100)}% upfront</div>
                </td>
                <td className="px-3 py-2">
                  {usd(BigInt(c.bond))} <span className="text-gold">{c.bondMultiple}×</span>
                </td>
                <td className="px-3 py-2">
                  {fmtLift(c.sellerLift)}
                  <div className="text-[11px] text-muted-foreground">{c.sellerItems} items settled</div>
                </td>
                <td className="px-3 py-2">
                  {usd(BigInt(c.currentUpfront) + BigInt(c.contingent))}
                  {BigInt(c.currentUpfront) < BigInt(c.upfront) && <div className="text-[11px] text-muted-foreground">decaying</div>}
                </td>
                <td className="px-3 py-2">{c.novelty > 0 ? <Tag tone="danger">{c.novelty} overlap</Tag> : <span className="text-muted-foreground">novel</span>}</td>
                <td className="px-3 py-2">
                  <Tag tone={c.status === "SETTLED" ? outcomeTone(c.outcome) : c.status === "OPEN" ? "gold" : "dim"}>{c.status === "SETTLED" ? c.outcome : c.status}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
