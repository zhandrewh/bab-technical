// Calibration (spec 8): per-seller Brier score by domain, computed off-chain from Committed + Settled events.
// Brier = mean((p - o)^2), p = stated confidence P(hits >= k), o = 1 if TRUE else 0. Lower is better; 0.25 = coin flip.
// Item precision (itemsHit / itemsCommitted) feeds seller lift. Replay (backtest) claims are excluded from both, and
// fabricated baskets never count toward items.
import type { FeedEvent } from "./events";
import { hexToString, type Hex } from "viem";

export type Prediction = {
  claimId: string;
  domain: string;
  resolver: string;
  predicted: number;
  outcome: "TRUE" | "FALSE" | "FABRICATED";
  actual: 0 | 1;
  n: number;
  k: number;
  hits: number;
  bond: string;
  slashed: string;
  settledAt: number;
  tx: string;
};

export type SellerCalibration = {
  seller: string;
  brier: number | null;
  n: number;
  byDomain: Record<string, { brier: number; n: number }>;
  history: Prediction[];
  open: number;
  slashedTotal: bigint;
  itemsCommitted: number;
  itemsHit: number;
  replays: number; // settled backtest baskets, shown but not scored
};

const OUT = ["NONE", "TRUE", "FALSE", "FABRICATED"] as const;
export const b32 = (h: unknown) => {
  try {
    return hexToString(h as Hex, { size: 32 }).replace(/\0/g, "");
  } catch {
    return String(h);
  }
};

export function calibrationFrom(events: FeedEvent[]): Map<string, SellerCalibration> {
  const commits = new Map<string, FeedEvent>();
  const out = new Map<string, SellerCalibration>();
  const get = (s: string) => {
    const k = s.toLowerCase();
    if (!out.has(k)) out.set(k, { seller: k, brier: null, n: 0, byDomain: {}, history: [], open: 0, slashedTotal: 0n, itemsCommitted: 0, itemsHit: 0, replays: 0 });
    return out.get(k)!;
  };
  for (const e of events) {
    if (e.kind === "Committed") {
      commits.set(e.claimId!, e);
      get(e.args.seller as string).open++;
    }
    if (e.kind === "Settled") {
      const c = commits.get(e.claimId!);
      if (!c) continue;
      const s = get(c.args.seller as string);
      s.open--;
      const resolver = b32(c.args.resolverId);
      if (resolver.endsWith("_REPLAY")) {
        s.replays++;
        continue;
      }
      const outcome = OUT[Number(e.args.outcome)] as Prediction["outcome"];
      const n = Number(c.args.n), hits = Number(e.args.hits);
      if (outcome !== "FABRICATED") {
        s.itemsCommitted += n;
        s.itemsHit += hits;
      }
      s.slashedTotal += BigInt(e.args.bondSlashed as string);
      s.history.push({
        claimId: e.claimId!,
        domain: b32(c.args.domain),
        resolver,
        predicted: Number(c.args.confidenceBps) / 10_000,
        outcome,
        actual: outcome === "TRUE" ? 1 : 0,
        n,
        k: Number(c.args.k),
        hits,
        bond: c.args.bond as string,
        slashed: e.args.bondSlashed as string,
        settledAt: e.ts,
        tx: e.tx,
      });
    }
  }
  for (const s of out.values()) {
    const sq = (p: Prediction) => (p.predicted - p.actual) ** 2;
    s.n = s.history.length;
    s.brier = s.n ? s.history.reduce((a, p) => a + sq(p), 0) / s.n : null;
    const doms: Record<string, Prediction[]> = {};
    for (const p of s.history) (doms[p.domain] ||= []).push(p);
    s.byDomain = Object.fromEntries(
      Object.entries(doms).map(([d, ps]) => [d, { n: ps.length, brier: ps.reduce((a, p) => a + sq(p), 0) / ps.length }]),
    );
    s.history.reverse();
  }
  return out;
}
