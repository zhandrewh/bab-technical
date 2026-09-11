// Sharpness (spec 3): what a random basket would do, so a buyer can tell a forecast from a base rate.
//   p0              declined-case (control) per-item hit rate from the backtest for the claim's window
//   expected        n × p0
//   randomOdds      P(X >= k), X ~ Binomial(n, p0): the chance a basket of random FCA notices makes this claim
//   seller lift     realized item precision / p0 (null until the seller has a settled item)
// Rates between the measured points are piecewise linear through (0, 0), (30d, p30), (60d, p60) and flat beyond 60d:
// a stated approximation. Releases cluster early after a settlement notice, so a straight line to p60 would understate
// short windows for the signal and overstate them for the control.
import baseline from "./fca-baseline.json";

export const BASELINE = baseline;
const WINDOW = baseline.windowDays;
const curve = (g: { p30: number | null; p60: number | null }, days: number) => {
  const d = Math.max(0, days), p30 = g.p30 ?? 0, p60 = g.p60 ?? p30;
  return d <= 30 ? (p30 * d) / 30 : d <= 60 ? p30 + ((p60 - p30) * (d - 30)) / 30 : p60;
};

/** Reference base rate for an item with this many days to resolve. */
export const baseRate = (days: number) => curve(baseline.control, days);
/** The backtested rate for settlement-intervention notices: what an honest seller agent expects per item. */
export const signalRate = (days: number) => curve(baseline.treatment, days);

function logChoose(n: number, k: number) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function binomTail(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n || p <= 0) return 0;
  if (p >= 1) return 1;
  let t = 0;
  for (let i = k; i <= n; i++) t += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, t);
}

/** The largest k the seller can claim while keeping P(hits >= k) at or above their confidence. */
export function suggestK(n: number, p: number, confidence: number): number {
  let best = 1;
  for (let k = 1; k <= n; k++) if (binomTail(n, k, p) >= confidence) best = k;
  return best;
}

export type Sharpness = { p0: number; expected: number; randomOdds: number; days: number };

export function sharpness(n: number, k: number, days: number): Sharpness {
  const p0 = baseRate(days);
  return { p0, expected: n * p0, randomOdds: binomTail(n, k, p0), days };
}

export function sellerLift(itemsHit: number, itemsCommitted: number): number | null {
  if (!itemsCommitted) return null;
  return itemsHit / itemsCommitted / baseRate(WINDOW);
}

export const fmtOdds = (p: number) => (p >= 0.1 ? `${Math.round(p * 100)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : p > 0 ? "<0.1%" : "0%");
export const fmtLift = (x: number | null) => (x == null ? "—" : `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`);
