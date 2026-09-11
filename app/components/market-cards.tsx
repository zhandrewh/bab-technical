"use client";
// Landing browse surface: category chips, a featured market and a card grid. Each card leads with the on-chain teaser
// ("3 of 12 …") and the number a buyer should compare it with: the odds a random basket would make the same claim.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClaimView } from "@/lib/claims";
import { usd } from "@/lib/chain";
import { fmtLift, fmtOdds } from "@/lib/odds";
import { Tag, outcomeTone, btnBase, btnVariant } from "./ui";

export const RESOLVERS: Record<string, { name: string; short: string }> = {
  DOJ_FCA: { name: "justice.gov", short: "DOJ" },
  DOJ_FCA_REPLAY: { name: "justice.gov · replay", short: "RPL" },
};
const resolverOf = (r: string) => RESOLVERS[r] ?? { name: r, short: r.slice(0, 3) };

const until = (ts: number) => {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "Ended";
  return s < 3600 ? `${Math.ceil(s / 60)}m left` : s < 86400 * 2 ? `${Math.round(s / 3600)}h left` : `${Math.round(s / 86400)}d left`;
};
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const price = (c: ClaimView) => usd(BigInt(c.currentUpfront) + BigInt(c.contingent));
const lift = (c: ClaimView) => (c.sellerLift == null ? "New seller" : `${fmtLift(c.sellerLift)} lift`);

type Chip = { key: string; label: string; pick: (cs: ClaimView[]) => ClaimView[] };
const open = (cs: ClaimView[]) => cs.filter((c) => c.status === "OPEN");
const CHIPS: Chip[] = [
  { key: "sharpest", label: "Sharpest", pick: (cs) => [...open(cs)].sort((a, b) => Number(a.replay) - Number(b.replay) || a.randomOdds - b.randomOdds) },
  { key: "new", label: "New", pick: (cs) => [...open(cs)].sort((a, b) => b.committedAt - a.committedAt) },
  { key: "ending", label: "Ending soon", pick: (cs) => open(cs).filter((c) => c.deadline > Date.now() / 1000).sort((a, b) => a.deadline - b.deadline) },
  { key: "live", label: "Live forecasts", pick: (cs) => open(cs).filter((c) => !c.replay) },
  { key: "replay", label: "Backtest replays", pick: (cs) => cs.filter((c) => c.replay) },
  { key: "settled", label: "Resolved", pick: (cs) => cs.filter((c) => c.status !== "OPEN") },
];

function ResolverIcon({ r, big }: { r: string; big?: boolean }) {
  return (
    <span className={`glass-gold grid shrink-0 place-items-center rounded-xl font-semibold text-gold ${big ? "size-12 text-[13px]" : "size-9 text-[11px]"}`}>
      {resolverOf(r).short}
    </span>
  );
}

/** k-of-N at a glance: n dots, the first k ringed (the claim); after settlement, hits are filled. */
export function KofN({ c, big }: { c: ClaimView; big?: boolean }) {
  const settled = c.status === "SETTLED" && c.outcome !== "FABRICATED";
  const size = big ? "size-3" : "size-2";
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={`${c.k} of ${c.n}${settled ? `, ${c.hits} hit` : ""}`}>
      {Array.from({ length: c.n }, (_, i) => {
        const filled = settled ? i < c.hits : false;
        const claimed = i < c.k;
        return (
          <span
            key={i}
            className={`${size} rounded-full ${filled ? "bg-gold" : claimed ? "border border-gold bg-gold/15" : "bg-white/[0.09]"}`}
          />
        );
      })}
    </div>
  );
}

function StatusTag({ c }: { c: ClaimView }) {
  if (c.status === "OPEN") return c.replay ? <Tag>Replay</Tag> : c.novelty > 0 ? <Tag tone="danger">{c.novelty} overlap</Tag> : <Tag tone="gold">Novel</Tag>;
  return (
    <Tag tone={c.status === "SETTLED" ? outcomeTone(c.outcome) : "dim"}>
      {c.status === "SETTLED" ? `${c.outcome.toLowerCase()}${c.outcome !== "FABRICATED" ? ` · ${c.hits}/${c.n}` : ""}` : c.status.toLowerCase()}
    </Tag>
  );
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
          <h3 className="mt-0.5 line-clamp-3 text-[14px] font-medium leading-snug text-foreground group-hover:text-gold">{c.teaser}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-semibold leading-none text-gold">{fmtOdds(c.randomOdds)}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">by chance</div>
        </div>
      </Link>

      <div className="mt-4">
        <KofN c={c} />
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          claims {c.k} · expected by chance {c.expected.toFixed(1)} of {c.n}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <BuyButton c={c} className="flex-1 py-2" />
        <StatusTag c={c} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {usd(BigInt(c.currentUpfront))} now · {usd(BigInt(c.contingent))} only if it hits and goes public
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-muted-foreground">
        <span>{lift(c)}</span>
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
        <span>{c.replay ? "Backtest replay" : "Featured basket"}</span>
      </div>
      <Link href={`/claim/${c.id}`} className="group mt-4 flex items-start gap-4">
        <ResolverIcon r={c.resolver} big />
        <div className="min-w-0">
          <div className="text-[12px] text-muted-foreground">
            Sealed basket #{c.id} · {c.domain || "federal fraud"}
          </div>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight text-foreground group-hover:text-gold sm:text-[26px]">{c.teaser}</h2>
        </div>
      </Link>

      <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <KofN c={c} big />
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              <span className="text-4xl font-semibold leading-none text-gold">{fmtOdds(c.randomOdds)}</span>
              <span className="ml-2 text-[13px] text-muted-foreground">odds a random basket does this</span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              expected by chance <span className="text-foreground">{c.expected.toFixed(1)}</span> · claimed <span className="text-foreground">{c.k}</span>
            </span>
          </div>
        </div>
        <BuyButton c={c} className="px-6 py-3 text-[14px]" />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Resolves via", r.name],
          ["Deadline", day(c.deadline)],
          ["Seller bond", `${usd(BigInt(c.bond))} · ${c.bondMultiple}×`],
          ["Seller lift", c.sellerLift == null ? "First basket" : `${fmtLift(c.sellerLift)} over ${c.sellerItems} items`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 truncate text-[13px] text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto pt-5 text-[12px] leading-relaxed text-muted-foreground">
        You pay {usd(BigInt(c.currentUpfront))} to unlock which cases. The other {usd(BigInt(c.contingent))} sits in escrow and reaches the seller only
        if at least {c.k} hit and the basket goes public. If fewer hit, the seller&apos;s bond is slashed and you&apos;re refunded.
      </p>
    </article>
  );
}

export function FeaturedClaim({ claims }: { claims: ClaimView[] }) {
  const pick = CHIPS[0].pick(claims)[0] ?? claims[0];
  if (!pick) {
    return (
      <div className="glass flex h-full flex-col items-start justify-center gap-3 rounded-3xl p-6">
        <div className="text-[22px] font-semibold">No open baskets yet.</div>
        <p className="text-[13px] text-muted-foreground">Reading sealed FCA dockets? Seal a basket on chain and set your price.</p>
        <Link href="/commit" className={`${btnBase} ${btnVariant.primary} px-5 py-2.5`}>
          Commit the first basket
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
            See all {rows.length} baskets →
          </Link>
        </div>
      )}
    </div>
  );
}
