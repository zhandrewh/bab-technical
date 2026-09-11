// Calibration (spec 8): per-seller Brier score by domain, computed off-chain from Committed + Settled events.
// Brier = mean((p - o)^2), p = stated confidence, o = 1 if TRUE else 0. Lower is better; 0.25 = coin flip.
import type { FeedEvent } from "./events";
import { hexToString, type Hex } from "viem";

export type Prediction = {
  claimId: string;
  domain: string;
  resolver: string;
  predicted: number;
  outcome: "TRUE" | "FALSE" | "FABRICATED";
  actual: 0 | 1;
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
    if (!out.has(k)) out.set(k, { seller: k, brier: null, n: 0, byDomain: {}, history: [], open: 0, slashedTotal: 0n });
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
      const outcome = OUT[Number(e.args.outcome)] as Prediction["outcome"];
      s.slashedTotal += BigInt(e.args.bondSlashed as string);
      s.history.push({
        claimId: e.claimId!,
        domain: b32(c.args.domain),
        resolver: b32(c.args.resolverId),
        predicted: Number(c.args.confidenceBps) / 10_000,
        outcome,
        actual: outcome === "TRUE" ? 1 : 0,
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
