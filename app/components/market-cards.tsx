"use client";
// Landing browse surface: category chips, a featured market and a docket-style list. Each row leads with the on-chain
// teaser ("3 of 12 …") and the number a buyer should compare it with: the odds a random basket would make the same claim.
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClaimView } from "@/lib/claims";
import { usd } from "@/lib/chain";
import { fmtLift, fmtOdds } from "@/lib/odds";
import { Stats, Tag, outcomeTone, btnBase, btnVariant } from "./ui";

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

// Columns shared by the header and every row, so figures line up down the list like a docket sheet.
const COLS = "lg:grid-cols-[3rem_minmax(0,1fr)_5.5rem_5.5rem_5rem_6.5rem]";

/** A labelled figure: the label shows on narrow screens, where there is no header row. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 lg:text-right">
      <div className="text-[11px] text-muted-foreground lg:hidden">{label}</div>
      <div className="tabular-nums">{children}</div>
    </div>
  );
}

function Row({ c }: { c: ClaimView }) {
  return (
    <li>
      <Link href={`/claim/${c.id}`} className={`group grid grid-cols-4 items-start gap-x-4 gap-y-3 px-4 py-4 text-[13px] transition-colors hover:bg-white/[0.025] lg:items-center ${COLS}`}>
        <span className="hidden text-[12px] tabular-nums text-muted-foreground lg:block">#{c.id}</span>
        <div className="col-span-4 min-w-0 lg:col-span-1">
          <div className="text-[14px] font-medium leading-snug text-foreground group-hover:text-gold">{c.teaser}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <KofN c={c} />
            <span>expected by chance {c.expected.toFixed(1)}</span>
            <span>{lift(c)}</span>
            <span>{c.bondMultiple}× bonded</span>
          </div>
        </div>
        <Cell label="By chance">
          <span className="text-[15px] font-semibold text-gold">{fmtOdds(c.randomOdds)}</span>
        </Cell>
        <Cell label="Price">
          <span className="text-foreground">{price(c)}</span>
        </Cell>
        <Cell label="Deadline">
          <span className="text-muted-foreground" suppressHydrationWarning>{until(c.deadline)}</span>
        </Cell>
        <Cell label="Status">
          <StatusTag c={c} />
        </Cell>
      </Link>
    </li>
  );
}

function Featured({ c }: { c: ClaimView }) {
  const r = resolverOf(c.resolver);
  return (
    <article className="surface flex h-full flex-col rounded-md p-6">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-gold">
        <span>{c.replay ? "Backtest replay" : "Featured basket"}</span>
      </div>
      <Link href={`/claim/${c.id}`} className="group mt-4 block">
        <div className="text-[12px] text-muted-foreground">
          Sealed basket #{c.id} · {c.domain || "federal fraud"}
        </div>
        <h2 className="mt-1 text-[22px] font-semibold leading-tight text-foreground group-hover:text-gold sm:text-[26px]">{c.teaser}</h2>
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

      <div className="mt-6 border-t border-border pt-5">
        <Stats
          items={[
            ["Resolves via", r.name],
            ["Deadline", day(c.deadline)],
            ["Seller bond", `${usd(BigInt(c.bond))} · ${c.bondMultiple}×`],
            ["Seller lift", c.sellerLift == null ? "First basket" : `${fmtLift(c.sellerLift)} over ${c.sellerItems} items`],
          ]}
        />
      </div>
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
      <div className="surface flex h-full flex-col items-start justify-center gap-3 rounded-md p-6">
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

// One segmented control: the gold thumb slides to whichever chip is picked instead of each chip being its own button.
function ChipPill({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // Keep the picked chip visible on narrow screens without scrolling the page vertically.
    const el = refs.current[value];
    const scroller = scrollRef.current;
    if (el && scroller) {
      const pad = 16;
      if (el.offsetLeft - pad < scroller.scrollLeft) scroller.scrollTo({ left: el.offsetLeft - pad, behavior: "smooth" });
      else if (el.offsetLeft + el.offsetWidth + pad > scroller.scrollLeft + scroller.clientWidth)
        scroller.scrollTo({ left: el.offsetLeft + el.offsetWidth + pad - scroller.clientWidth, behavior: "smooth" });
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  return (
    <div ref={scrollRef} className="bab-scroll -mx-1 overflow-x-auto px-1 pb-1">
      <div role="tablist" className="surface relative flex w-max rounded-md p-1">
        {thumb && (
          <span
            aria-hidden
            className="fill-gold pointer-events-none rounded transition-[left,width] duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none"
            style={{ position: "absolute", top: 4, bottom: 4, left: thumb.left, width: thumb.width }}
          />
        )}
        {CHIPS.map((c) => (
          <button
            key={c.key}
            ref={(el) => {
              refs.current[c.key] = el;
            }}
            role="tab"
            aria-selected={value === c.key}
            onClick={() => onChange(c.key)}
            className={`relative z-10 shrink-0 rounded px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-300 ${value === c.key ? "text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MarketCards({ claims, limit = 9 }: { claims: ClaimView[]; limit?: number }) {
  const [chip, setChip] = useState(CHIPS[0].key);
  const rows = useMemo(() => (CHIPS.find((c) => c.key === chip) ?? CHIPS[0]).pick(claims), [chip, claims]);

  return (
    <div className="space-y-5">
      <ChipPill value={chip} onChange={setChip} />

      {rows.length === 0 ? (
        <div className="surface rounded-md px-6 py-10 text-center text-[13px] text-muted-foreground">
          Nothing here yet.
        </div>
      ) : (
        <div className="surface overflow-hidden rounded-md">
          <div className={`hidden gap-x-4 border-b border-border px-4 py-2.5 text-[11px] text-muted-foreground lg:grid ${COLS}`}>
            <span>No.</span>
            <span>Claim</span>
            <span className="text-right">By chance</span>
            <span className="text-right">Price</span>
            <span className="text-right">Deadline</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.slice(0, limit).map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
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
