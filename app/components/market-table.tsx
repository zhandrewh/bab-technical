"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClaimView } from "@/lib/claims";
import { usd } from "@/lib/chain";
import { Tag, brierText, outcomeTone } from "./ui";

const inputCls = "glass-input rounded-xl px-3 py-1.5 text-[13px] outline-none";
const until = (ts: number) => {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "passed";
  return s < 3600 ? `${Math.ceil(s / 60)}m` : s < 86400 * 2 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

export function MarketTable({ claims }: { claims: ClaimView[] }) {
  const [status, setStatus] = useState("OPEN");
  const [resolver, setResolver] = useState("");
  const [domain, setDomain] = useState("");
  const [maxBrier, setMaxBrier] = useState("");
  const [minBond, setMinBond] = useState("");

  const rows = useMemo(
    () =>
      claims.filter(
        (c) =>
          (!status || c.status === status) &&
          (!resolver || c.resolver === resolver) &&
          (!domain || c.domain.includes(domain.toLowerCase())) &&
          (!maxBrier || (c.sellerBrier != null && c.sellerBrier <= Number(maxBrier))) &&
          (!minBond || c.bondMultiple >= Number(minBond)),
      ),
    [claims, status, resolver, domain, maxBrier, minBond],
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
            {["FEDREG", "SAM", "COURTLISTENER"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">domain</span>
          <input className={`${inputCls} w-36`} placeholder="fedreg:defense" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="label">seller brier ≤</span>
          <input className={`${inputCls} w-20`} placeholder="0.20" value={maxBrier} onChange={(e) => setMaxBrier(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="label">bond ≥ ×</span>
          <input className={`${inputCls} w-16`} placeholder="5" value={minBond} onChange={(e) => setMinBond(e.target.value)} />
        </label>
      </div>

      <div className="glass bab-scroll overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              {["claim", "resolver", "deadline", "domain", "upfront / contingent", "bond", "seller brier", "decayed ask", "novelty", "status"].map((h) => (
                <th key={h} className="px-3 py-3 text-[12px] font-medium text-muted-foreground first-letter:uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">No claims match. Loosen a filter, or post a standing bid so sellers come to you.</td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-white/[0.04]">
                <td className="px-3 py-2">
                  <Link href={`/claim/${c.id}`} className="text-gold hover:underline">#{c.id} sealed</Link>
                  <div className="text-[11px] text-muted-foreground">{c.claimHash.slice(0, 10)}…</div>
                </td>
                <td className="px-3 py-2">{c.resolver}</td>
                <td className="px-3 py-2">{until(c.deadline)}</td>
                <td className="px-3 py-2 text-gold-dim">{c.domain}</td>
                <td className="px-3 py-2">
                  {usd(BigInt(c.upfront))} / {usd(BigInt(c.contingent))}
                  <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-border"><div className="h-1 rounded-full bg-gold-dim" style={{ width: `${c.upfrontShare * 100}%` }} /></div>
                  <div className="text-[11px] text-muted-foreground">{Math.round(c.upfrontShare * 100)}% upfront</div>
                </td>
                <td className="px-3 py-2">
                  {usd(BigInt(c.bond))} <span className="text-gold">{c.bondMultiple}×</span>
                </td>
                <td className="px-3 py-2">
                  {brierText(c.sellerBrier)}
                  <div className="text-[11px] text-muted-foreground">{c.sellerSettled} settled</div>
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
