"use client";
// Live settlement feed: every commit, purchase, publication, resolution and slash as it lands, from the event log.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "@/lib/events";
import { usd } from "@/lib/chain";
import { TxLink } from "./ui";

const OUT = ["NONE", "TRUE", "FALSE", "FABRICATED"];
const short = (a: unknown) => (typeof a === "string" ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const $ = (v: unknown) => usd(BigInt((v as string) ?? "0"));

function describe(e: FeedEvent): { tag: string; tone: string; text: React.ReactNode } {
  const a = e.args;
  const claim = e.claimId != null && (
    <Link href={`/claim/${e.claimId}`} className="text-gold hover:underline">
      #{e.claimId}
    </Link>
  );
  switch (e.kind) {
    case "Committed":
      return { tag: "commit", tone: "text-gold", text: <>{short(a.seller)} sealed claim {claim} · bond {$(a.bond)} · ask {$(a.upfront)} + {$(a.contingent)} contingent</> };
    case "Purchased":
      return { tag: "purchase", tone: "text-gold", text: <>{short(a.buyer)} bought {claim} blind · {$(a.upfrontPaid)} to seller, {$(a.contingentEscrowed)} escrowed</> };
    case "Published":
      return { tag: "public", tone: "text-foreground", text: <>{claim} reached the public record</> };
    case "Proposed":
      return { tag: "propose", tone: "text-gold-dim", text: <>oracle proposed {claim} = {OUT[Number(a.outcome)]} · challenge window open</> };
    case "Disputed":
      return { tag: "dispute", tone: "text-danger", text: <>{short(a.disputer)} disputed {claim} · to owner backstop</> };
    case "DisputeResolved":
      return { tag: "backstop", tone: "text-gold-dim", text: <>backstop resolved {claim} = {OUT[Number(a.outcome)]}</> };
    case "Settled": {
      const o = OUT[Number(a.outcome)];
      return {
        tag: "settle",
        tone: o === "TRUE" ? "text-gold" : "text-danger",
        text: (
          <>
            {claim} settled {o}
            {o === "TRUE" ? (a.publicByDeadline ? ` · ${$(a.contingentToSeller)} contingent to seller` : ` · unpublished: ${$(a.contingentToPool)} to public-goods pool`) : ` · ${$(a.contingentRefunded)} refunded to buyers`}
          </>
        ),
      };
    }
    case "Slashed":
      return { tag: "slash", tone: "text-danger", text: <>bond burned on {claim}: {$(a.amount)} slashed · {$(a.toBuyers)} to buyers · {$(a.toPool)} to pool</> };
    case "BidPosted":
      return { tag: "bid", tone: "text-gold-dim", text: <>{short(a.bidder)} posted standing bid {$(a.amount)} · {String(a.criteria).slice(0, 60)}</> };
    case "BidFilled":
      return { tag: "fill", tone: "text-gold", text: <>bid #{String(a.bidId)} filled with {claim}</> };
    case "BidCancelled":
      return { tag: "cancel", tone: "text-gold-dim", text: <>bid #{String(a.bidId)} cancelled</> };
    default:
      return { tag: e.kind.toLowerCase().slice(0, 8), tone: "text-gold-dim", text: <>{e.kind}</> };
  }
}

const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

export function LiveFeed({ initial, limit = 60, claimId, compact }: { initial: FeedEvent[]; limit?: number; claimId?: string; compact?: boolean }) {
  const [events, setEvents] = useState(initial);
  const [status, setStatus] = useState("listening for new blocks");
  const seen = useRef(new Set(initial.map((e) => `${e.tx}:${e.logIndex}`)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const url = `/api/feed?limit=${limit}${claimId ? `&claimId=${claimId}` : ""}`;
    const tick = async () => {
      if (document.hidden) return; // no polling from background tabs; catch up on return
      try {
        setStatus("polling base sepolia event log");
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as { events: FeedEvent[] };
        if (!alive) return;
        const nu = new Set<string>();
        for (const e of j.events) {
          const k = `${e.tx}:${e.logIndex}`;
          if (!seen.current.has(k)) {
            seen.current.add(k);
            nu.add(k);
          }
        }
        if (nu.size) setFresh(nu);
        setEvents((prev) => (nu.size || prev.length !== j.events.length ? j.events : prev));
        setStatus(`listening · last poll ${new Date().toLocaleTimeString()}`);
      } catch {
        setStatus("rpc unreachable — retrying in 6s");
      }
    };
    const onVisible = () => !document.hidden && tick();
    const id = setInterval(tick, 6000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [limit, claimId]);

  const rows = events.slice(0, limit);
  return (
    <div>
      <div className="mb-2 text-[12px] text-muted-foreground">
        <span className="live first-letter:uppercase">{status}</span>
      </div>
      {rows.length === 0 && <div className="py-6 text-[13px] text-muted-foreground">No transactions yet. The first commit will appear here within one block.</div>}
      <ul className="glass divide-y divide-white/[0.06] overflow-hidden rounded-3xl">
        {rows.map((e) => {
          const d = describe(e);
          const k = `${e.tx}:${e.logIndex}`;
          if (compact)
            return (
              <li key={k} className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-4 py-3 text-[13px] ${fresh.has(k) ? "feed-new" : ""}`}>
                <span className={`w-fit rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium capitalize ${d.tone}`}>{d.tag}</span>
                <span className="min-w-0 truncate text-foreground/90">{d.text}</span>
                <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>{ago(e.ts)} ago</span>
              </li>
            );
          return (
            <li key={k} className={`grid grid-cols-[3rem_5.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-[13px] ${fresh.has(k) ? "feed-new" : ""}`}>
              <span className="text-[12px] text-muted-foreground">{ago(e.ts)}</span>
              <span className={`w-fit rounded-full bg-white/[0.07] px-2 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] text-[11px] font-medium capitalize ${d.tone}`}>{d.tag}</span>
              <span className="min-w-0 text-foreground/90">{d.text}</span>
              <span className="text-[11px]">
                <TxLink hash={e.tx} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
