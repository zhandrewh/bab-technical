"use client";
// Landing browse surface: category chips, a featured market and a card grid. Each card leads with the seller's stated
// confidence (the "price" a buyer is betting on) and one clear buy action.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClaimView } from "@/lib/claims";
import { usd } from "@/lib/chain";
import { Tag, brierText, outcomeTone, btnBase, btnVariant } from "./ui";

export const RESOLVERS: Record<string, { name: string; short: string }> = {
  FEDREG: { name: "Federal Register", short: "FR" },
  SAM: { name: "SAM.gov", short: "SAM" },
  COURTLISTENER: { name: "CourtListener", short: "CL" },
};
const resolverOf = (r: string) => RESOLVERS[r] ?? { name: r, short: r.slice(0, 3) };

const until = (ts: number) => {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "Ended";
  return s < 3600 ? `${Math.ceil(s / 60)}m left` : s < 86400 * 2 ? `${Math.round(s / 3600)}h left` : `${Math.round(s / 86400)}d left`;
};
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const price = (c: ClaimView) => usd(BigInt(c.currentUpfront) + BigInt(c.contingent));
const pct = (c: ClaimView) => Math.round(c.confidence * 100);
const question = (c: ClaimView) => `Will ${resolverOf(c.resolver).name} confirm it by ${day(c.deadline)}?`;

type Chip = { key: string; label: string; pick: (cs: ClaimView[]) => ClaimView[] };
const open = (cs: ClaimView[]) => cs.filter((c) => c.status === "OPEN");
const CHIPS: Chip[] = [
  { key: "trending", label: "Trending", pick: (cs) => [...open(cs)].sort((a, b) => b.buyers - a.buyers || b.confidence - a.confidence) },
  { key: "new", label: "New", pick: (cs) => [...open(cs)].sort((a, b) => b.committedAt - a.committedAt) },
  { key: "ending", label: "Ending soon", pick: (cs) => open(cs).filter((c) => c.deadline > Date.now() / 1000).sort((a, b) => a.deadline - b.deadline) },
  ...Object.entries(RESOLVERS).map(([k, r]) => ({ key: k, label: r.name, pick: (cs: ClaimView[]) => open(cs).filter((c) => c.resolver === k) })),
  { key: "settled", label: "Resolved", pick: (cs) => cs.filter((c) => c.status !== "OPEN") },
];

function ResolverIcon({ r, big }: { r: string; big?: boolean }) {
  return (
    <span className={`glass-gold grid shrink-0 place-items-center rounded-xl font-semibold text-gold ${big ? "size-12 text-[13px]" : "size-9 text-[11px]"}`}>
      {resolverOf(r).short}
    </span>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatusTag({ c }: { c: ClaimView }) {
  if (c.status === "OPEN") return c.novelty > 0 ? <Tag tone="danger">{c.novelty} overlap</Tag> : <Tag tone="gold">Novel</Tag>;
  return <Tag tone={c.status === "SETTLED" ? outcomeTone(c.outcome) : "dim"}>{c.status === "SETTLED" ? c.outcome.toLowerCase() : c.status.toLowerCase()}</Tag>;
}

function BuyButton({ c, className = "" }: { c: ClaimView; className?: string }) {
  const live = c.status === "OPEN";
  return (
    <Link href={`/claim/${c.id}`} className={`${btnBase} ${live ? btnVariant.primary : btnVariant.idle} ${className}`}>
      {live ? <>Buy · {price(c)}</> : "View result"}
    </Link>
  );
}

function Card({ c }: { c: ClaimView }) {
  return (
    <article className="glass group flex flex-col rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <Link href={`/claim/${c.id}`} className="flex items-start gap-3">
        <ResolverIcon r={c.resolver} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted-foreground">{c.domain || "sealed"}</div>
          <h3 className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug text-foreground group-hover:text-gold">{question(c)}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-semibold leading-none text-gold">{pct(c)}%</div>
          <div className="mt-1 text-[10px] text-muted-foreground">confidence</div>
        </div>
      </Link>

      <div className="mt-4">
        <Meter value={pct(c)} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <BuyButton c={c} className="flex-1 py-2" />
        <StatusTag c={c} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {usd(BigInt(c.currentUpfront))} now · {usd(BigInt(c.contingent))} only if it goes public
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-muted-foreground">
        <span>{c.buyers} {c.buyers === 1 ? "buyer" : "buyers"}</span>
        <span>
          <span className="text-gold-dim">{c.bondMultiple}×</span> bonded
        </span>
        <span suppressHydrationWarning>{until(c.deadline)}</span>
      </div>
    </article>
  );
}

function Featured({ c }: { c: ClaimView }) {
  const r = resolverOf(c.resolver);
  return (
    <article className="glass flex h-full flex-col rounded-3xl p-6">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-gold">
        <span className="live">Featured finding</span>
      </div>
      <Link href={`/claim/${c.id}`} className="group mt-4 flex items-start gap-4">
        <ResolverIcon r={c.resolver} big />
        <div className="min-w-0">
          <div className="text-[12px] text-muted-foreground">
            Sealed claim #{c.id} · {c.domain || "public records"}
          </div>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight text-foreground group-hover:text-gold sm:text-[26px]">{question(c)}</h2>
        </div>
      </Link>

      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold leading-none text-gold">{pct(c)}%</span>
            <span className="text-[13px] text-muted-foreground">seller confidence</span>
          </div>
          <div className="mt-3 max-w-md">
            <Meter value={pct(c)} />
          </div>
        </div>
        <BuyButton c={c} className="px-6 py-3 text-[14px]" />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Resolves via", r.name],
          ["Deadline", day(c.deadline)],
          ["Seller bond", `${usd(BigInt(c.bond))} · ${c.bondMultiple}×`],
          ["Seller track record", c.sellerSettled ? `Brier ${brierText(c.sellerBrier)}` : "First claim"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 truncate text-[13px] text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto pt-5 text-[12px] leading-relaxed text-muted-foreground">
        You pay {usd(BigInt(c.currentUpfront))} to unlock now. The other {usd(BigInt(c.contingent))} sits in escrow and only reaches the seller if the
        finding goes public — if it’s false, the seller’s bond is slashed and you’re refunded.
      </p>
    </article>
  );
}

export function FeaturedClaim({ claims }: { claims: ClaimView[] }) {
  const pick = CHIPS[0].pick(claims)[0];
  if (!pick) {
    return (
      <div className="glass flex h-full flex-col items-start justify-center gap-3 rounded-3xl p-6">
        <div className="text-[22px] font-semibold">No open findings yet.</div>
        <p className="text-[13px] text-muted-foreground">Spotted something in public records? Seal it on chain and set your price.</p>
        <Link href="/commit" className={`${btnBase} ${btnVariant.primary} px-5 py-2.5`}>
          Commit the first finding
        </Link>
      </div>
    );
  }
  return <Featured c={pick} />;
}

export function MarketCards({ claims, limit = 9 }: { claims: ClaimView[]; limit?: number }) {
  const [chip, setChip] = useState(CHIPS[0].key);
  const rows = useMemo(() => (CHIPS.find((c) => c.key === chip) ?? CHIPS[0]).pick(claims), [chip, claims]);

  return (
    <div className="space-y-5">
      <div className="bab-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className={`glass-press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ${chip === c.key ? "glass-solid text-background" : "glass text-muted-foreground hover:text-foreground"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-10 text-center text-[13px] text-muted-foreground">
          Nothing here yet.{" "}
          <Link href="/bids" className="text-gold hover:underline">
            Post a standing bid
          </Link>{" "}
          and sellers will come to you.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, limit).map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      )}
      {rows.length > limit && (
        <div className="text-center">
          <Link href="/market" className={`${btnBase} ${btnVariant.idle} px-5 py-2`}>
            See all {rows.length} markets →
          </Link>
        </div>
      )}
    </div>
  );
}
