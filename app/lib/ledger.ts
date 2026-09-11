// Ledger graph: the event log laid out like a git history. The trunk is the contract itself (admin events, standing
// bids). Every claim branches off the trunk at Committed, carries its purchases, publication, proposal and disputes
// as commits, and merges back on settlement. Pure functions, so the layout is testable without a chain.
import type { FeedEvent } from "./events";
import type { ClaimView } from "./claims";
import { b32 } from "./calibration";

/** The four things a reviewer grades. Every node is tagged with the lenses it is evidence for. */
export type Lens = "delivery" | "credibility" | "protection" | "settlement";

export const LENSES: { id: Lens; label: string; question: string; proof: string }[] = [
  {
    id: "delivery",
    label: "Information delivery",
    question: "How does the buyer get what they paid for, and who could withhold it?",
    proof:
      "The evidence is encrypted at commit and its hash is on chain. Buying flips purchased[claim][buyer] to true; the key layer releases the key when canDecrypt() reads true, and the seller is not in that path. When the exclusivity window ends, canDecrypt() is true for everyone: the finding reaches the public without any transaction.",
  },
  {
    id: "credibility",
    label: "Seller credibility",
    question: "Why should a buyer believe a stranger who will not show the goods?",
    proof:
      "Every commit posts a USDC bond, a stated confidence, a Merkle root that fixes which items are in the basket, and an attestation the contract requires. Every settlement writes the result into the seller's on-chain record: items hit over items committed (lift), stated confidence against outcome (Brier), bonds slashed.",
  },
  {
    id: "protection",
    label: "Buyer protection",
    question: "What happens to the buyer's money when the seller is wrong, or lying?",
    proof:
      "Both tranches are escrowed at purchase; the contingent tranche never reaches the seller unless the claim resolves true and public. A false claim refunds the contingent tranche and pays buyers half of the slashed bond. A fabricated basket burns the whole bond, and buyers are made whole on their upfront before anything goes to the pool.",
  },
  {
    id: "settlement",
    label: "Payment, verification, disputes, reputation",
    question: "Who decides, how can they be challenged, and what does the outcome change?",
    proof:
      "A bonded proposer posts an outcome and a per-item hit mask that the contract checks against k. Anyone can dispute within the challenge window by posting a matching bond; the owner backstop resolves disputes and the wrong side loses its bond. Settlement moves money per the table and updates the seller record that reputation and standing bids read.",
  },
];

export type Tone = "gold" | "dim" | "danger" | "fg";

export type LedgerNode = {
  key: string;
  kind: string; // event name, or a derived kind such as "KeyOpen"
  claimId?: string;
  bidId?: string;
  lane: number; // 0 = trunk
  ts: number;
  tx?: string;
  block?: string;
  derived: boolean; // no transaction: a consequence of on-chain state and time
  tone: Tone;
  tag: string;
  title: string;
  detail: string;
  actor?: string;
  lenses: Lens[];
  money: [string, string][]; // labelled USDC amounts (already formatted)
  args: Record<string, unknown>;
  branches: boolean; // opens a lane off the trunk
  merges: boolean; // closes a lane back into the trunk
};

export type LaneSpan = { lane: number; claimId: string; from: number; to: number; merged: boolean; tone: Tone }; // row indices, display order (newest first)

export type Ledger = {
  rows: LedgerNode[]; // display order: newest first
  spans: LaneSpan[];
  lanes: number; // total lanes including trunk
  totals: LedgerTotals;
};

export type LedgerTotals = {
  transactions: number;
  claims: number;
  settled: number;
  purchases: number;
  bonded: bigint;
  toSellers: bigint; // upfront paid + contingent released
  escrowedNow: bigint; // contingent held on open claims
  refunded: bigint;
  slashed: bigint;
  toBuyersFromSlash: bigint;
  toPool: bigint;
};

const OUT = ["NONE", "TRUE", "FALSE", "FABRICATED"];
const big = (v: unknown) => BigInt((v as string) ?? "0");
const short = (a: unknown) => (typeof a === "string" ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const popcount = (mask: unknown) => BigInt((mask as string) ?? "0").toString(2).split("").filter((b) => b === "1").length;

/** USDC has 6 decimals; formatted here so the client does no BigInt work. */
export const fmtUsd = (v: bigint) => {
  const n = Number(v) / 1e6;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;
};

function describe(e: FeedEvent, relayer?: string): Omit<LedgerNode, "key" | "lane" | "ts" | "derived" | "branches" | "merges" | "args" | "claimId" | "bidId" | "tx" | "block"> {
  const a = e.args;
  const $ = (k: string) => fmtUsd(big(a[k]));
  switch (e.kind) {
    case "Committed":
      return {
        kind: e.kind,
        tone: "gold",
        tag: "commit",
        title: `sealed basket: “${String(a.teaser)}”`,
        detail: `Bond posted, Merkle root and payload hash fixed, attestation required. Exclusivity and deadline set now and cannot move.`,
        actor: a.seller as string,
        lenses: ["credibility", "delivery"],
        money: [["bond", $("bond")], ["upfront ask", $("upfront")], ["contingent", $("contingent")]],
      };
    case "Purchased": {
      const viaAgent = relayer && String(a.payer).toLowerCase() === relayer.toLowerCase();
      return {
        kind: e.kind,
        tone: "gold",
        tag: viaAgent ? "x402 buy" : "purchase",
        title: `${short(a.buyer)} bought blind${viaAgent ? " over x402 (paid by the relayer, escrowed for the agent)" : ""}`,
        detail: `Upfront went to the seller now; the contingent tranche is held by the contract. purchased[claim][buyer] is now true, so the key layer will release the key to this address.`,
        actor: a.buyer as string,
        lenses: ["settlement", "delivery", "protection"],
        money: [["upfront → seller", $("upfrontPaid")], ["contingent → escrow", $("contingentEscrowed")]],
      };
    }
    case "Published":
      return {
        kind: e.kind,
        tone: "fg",
        tag: "public",
        title: "reached the public record",
        detail: "The oracle marked the finding public with a link to the record. Publication before the deadline is what lets the seller collect the contingent tranche.",
        lenses: ["delivery", "settlement"],
        money: [],
      };
    case "Proposed": {
      const o = OUT[Number(a.outcome)];
      return {
        kind: e.kind,
        tone: "dim",
        tag: "propose",
        title: `oracle proposed ${o}${o !== "FABRICATED" ? ` with ${popcount(a.hitMask)} hits` : ""}`,
        detail: "A bonded proposal. The contract checked the hit mask against k. The challenge window is open: anyone may dispute by posting a matching bond.",
        actor: a.proposer as string,
        lenses: ["settlement", "credibility"],
        money: [],
      };
    }
    case "Disputed":
      return {
        kind: e.kind,
        tone: "danger",
        tag: "dispute",
        title: `${short(a.disputer)} disputed the proposal`,
        detail: "A matching bond was posted. The claim is frozen until the owner backstop resolves it; the losing side forfeits its bond.",
        actor: a.disputer as string,
        lenses: ["settlement", "protection"],
        money: [],
      };
    case "DisputeResolved":
      return {
        kind: e.kind,
        tone: "dim",
        tag: "backstop",
        title: `backstop resolved ${OUT[Number(a.outcome)]}; ${short(a.winner)} takes both bonds`,
        detail: "The owner supplied the corrected outcome and hit mask under the same consistency rules the proposer faced.",
        lenses: ["settlement", "protection"],
        money: [["bonds awarded", $("bondsAwarded")]],
      };
    case "Settled": {
      const o = OUT[Number(a.outcome)];
      const pub = a.publicByDeadline as boolean;
      const money: [string, string][] = [];
      if (big(a.contingentToSeller) > 0n) money.push(["contingent → seller", $("contingentToSeller")]);
      if (big(a.contingentToPool) > 0n) money.push(["contingent → public-goods pool", $("contingentToPool")]);
      if (big(a.contingentRefunded) > 0n) money.push(["contingent → refunded to buyers", $("contingentRefunded")]);
      if (big(a.bondReturned) > 0n) money.push(["bond → returned", $("bondReturned")]);
      if (big(a.bondSlashed) > 0n) money.push(["bond → slashed", $("bondSlashed")]);
      return {
        kind: e.kind,
        tone: o === "TRUE" ? "gold" : "danger",
        tag: "settle",
        title: `settled ${o}${o !== "FABRICATED" ? `, ${String(a.hits)} hit` : ""}${o === "TRUE" && !pub ? ", never published: contingent to the pool" : ""}`,
        detail:
          o === "TRUE"
            ? "The seller's record gains the hits and the bond comes back. Buyers keep the finding; the contingent tranche follows the payout table."
            : o === "FALSE"
              ? "Fewer than k items hit by the deadline. Buyers get the contingent tranche back plus half of the slashed bond."
              : "The evidence did not match the commitment or cited records that do not exist. The whole bond is slashed and buyers are made whole first.",
        lenses: ["settlement", "protection", "credibility"],
        money,
      };
    }
    case "Slashed":
      return {
        kind: e.kind,
        tone: "danger",
        tag: "slash",
        title: `bond burned: ${$("amount")} taken from the seller`,
        detail: "Split between the buyers of this claim and the public-goods pool. Written to the seller's on-chain record.",
        actor: a.seller as string,
        lenses: ["protection", "credibility"],
        money: [["→ buyers", $("toBuyers")], ["→ pool", $("toPool")]],
      };
    case "BidPosted":
      return {
        kind: e.kind,
        tone: "dim",
        tag: "bid",
        title: `${short(a.bidder)} posted a standing bid: ${String(a.criteria).slice(0, 80)}`,
        detail: `USDC escrowed in StandingBids until a seller fills it with a committed claim${a.maxBrierBps ? ` whose seller has a Brier score under ${Number(a.maxBrierBps) / 10_000}` : ""}.`,
        actor: a.bidder as string,
        lenses: ["settlement", "credibility"],
        money: [["escrowed", $("amount")]],
      };
    case "BidFilled":
      return { kind: e.kind, tone: "gold", tag: "fill", title: `bid #${String(a.bidId)} filled with claim #${String(a.claimId)}`, detail: "The fill routes through purchaseFor, so on the market it is indistinguishable from a purchase.", actor: a.seller as string, lenses: ["settlement"], money: [] };
    case "BidCancelled":
      return { kind: e.kind, tone: "dim", tag: "cancel", title: `bid #${String(a.bidId)} cancelled`, detail: "Escrow returned to the bidder.", lenses: ["settlement"], money: [["refunded", $("refunded")]] };
    case "ResolverSet":
      return {
        kind: e.kind,
        tone: "dim",
        tag: "resolver",
        title: `resolver ${b32(a.resolverId)} ${a.allowed ? "whitelisted" : "removed"}${a.replay ? " (replay: settles on history, no seller record)" : ""}`,
        detail: "Claims can only cite a whitelisted institution. No buyer-controlled resolver exists.",
        lenses: ["credibility", "settlement"],
        money: [],
      };
    case "OracleSet":
      return { kind: e.kind, tone: "dim", tag: "oracle", title: `${short(a.oracle)} ${a.allowed ? "may" : "may no longer"} mark claims published`, detail: "Proposals are permissionless and bonded; this role only records publication.", lenses: ["settlement"], money: [] };
    case "OwnershipTransferred":
      return { kind: e.kind, tone: "dim", tag: "deploy", title: `contract deployed; owner ${short(a.newOwner)}`, detail: "The owner is the dispute backstop and sets the resolver whitelist. Stated in the trust model.", lenses: ["settlement"], money: [] };
    default:
      return { kind: e.kind, tone: "dim", tag: e.kind.toLowerCase().slice(0, 9), title: e.kind, detail: "", lenses: [], money: [] };
  }
}

/** Builds the graph. `claims` supplies the derived key-release nodes; `relayer` marks x402 purchases. */
export function buildLedger(events: FeedEvent[], claims: ClaimView[] = [], relayer?: string, now = Date.now() / 1000): Ledger {
  const chrono = [...events].sort((a, b) => Number(BigInt(a.block) - BigInt(b.block)) || a.logIndex - b.logIndex);
  const nodes: LedgerNode[] = chrono.map((e) => ({
    key: `${e.tx}:${e.logIndex}`,
    ...describe(e, relayer),
    claimId: e.claimId,
    bidId: e.bidId,
    lane: 0,
    ts: e.ts,
    tx: e.tx,
    block: e.block,
    derived: false,
    args: e.args,
    branches: false,
    merges: false,
  }));

  // Derived: the exclusivity window ending opens the key to everyone. No transaction; the key layer just reads canDecrypt().
  for (const c of claims) {
    if (c.exclusivityEnd > now) continue;
    const last = [...nodes].reverse().find((n) => n.claimId === c.id && (n.kind === "Settled" || n.kind === "Slashed"));
    if (last && last.ts < c.exclusivityEnd) continue; // lane already merged; the claim page still shows it
    nodes.push({
      key: `keyopen:${c.id}`,
      kind: "KeyOpen",
      claimId: c.id,
      lane: 0,
      ts: c.exclusivityEnd,
      derived: true,
      tone: "fg",
      tag: "key opens",
      title: "exclusivity ended: canDecrypt() is true for every address",
      detail: "Not a transaction. The window was fixed at commit; from this moment the key layer releases the key to anyone who asks, with no action by the seller or the buyers.",
      lenses: ["delivery"],
      money: [],
      args: { exclusivityEnd: c.exclusivityEnd },
      branches: false,
      merges: false,
    });
  }
  nodes.sort((a, b) => a.ts - b.ts || (a.block && b.block ? Number(BigInt(a.block) - BigInt(b.block)) : 0) || (a.derived ? 1 : 0) - (b.derived ? 1 : 0));

  // Lanes: allocate at Committed, free after the claim's final node once it has settled.
  const lastIndex = new Map<string, number>();
  const settledClaims = new Set<string>();
  nodes.forEach((n, i) => {
    if (n.claimId != null && n.kind !== "BidFilled") lastIndex.set(n.claimId, i);
    if (n.kind === "Settled") settledClaims.add(n.claimId!);
  });
  const laneOf = new Map<string, number>();
  const free: boolean[] = [true]; // index 0 = trunk, never free
  free[0] = false;
  const chronoSpans: { lane: number; claimId: string; start: number; end: number | null }[] = [];
  nodes.forEach((n, i) => {
    if (n.kind === "Committed") {
      let lane = free.findIndex((f, idx) => idx > 0 && f);
      if (lane === -1) lane = free.push(true) - 1;
      free[lane] = false;
      laneOf.set(n.claimId!, lane);
      n.branches = true;
      chronoSpans.push({ lane, claimId: n.claimId!, start: i, end: null });
    }
    if (n.claimId != null && n.kind !== "BidFilled" && laneOf.has(n.claimId)) n.lane = laneOf.get(n.claimId)!;
    if (n.claimId != null && settledClaims.has(n.claimId) && lastIndex.get(n.claimId) === i && laneOf.has(n.claimId)) {
      n.merges = true;
      const lane = laneOf.get(n.claimId)!;
      const span = chronoSpans.find((s) => s.claimId === n.claimId && s.end === null);
      if (span) span.end = i;
      free[lane] = true;
      laneOf.delete(n.claimId);
    }
  });

  const total = nodes.length;
  const rows = [...nodes].reverse();
  const spans: LaneSpan[] = chronoSpans.map((s) => {
    const settled = s.end === null ? undefined : nodes.slice(s.start, s.end + 1).find((n) => n.kind === "Settled");
    return { lane: s.lane, claimId: s.claimId, from: s.end === null ? 0 : total - 1 - s.end, to: total - 1 - s.start, merged: s.end !== null, tone: settled?.tone ?? "dim" };
  });

  return { rows, spans, lanes: Math.max(1, free.length), totals: totals(chrono, claims) };
}

function totals(events: FeedEvent[], claims: ClaimView[]): LedgerTotals {
  const sum = (kind: string, field: string) => events.filter((e) => e.kind === kind).reduce((a, e) => a + big(e.args[field]), 0n);
  const openContingent = claims.filter((c) => c.status !== "SETTLED").reduce((a, c) => a + BigInt(c.contingent) * BigInt(c.buyers), 0n);
  return {
    transactions: new Set(events.map((e) => e.tx)).size,
    claims: events.filter((e) => e.kind === "Committed").length,
    settled: events.filter((e) => e.kind === "Settled").length,
    purchases: events.filter((e) => e.kind === "Purchased").length,
    bonded: sum("Committed", "bond"),
    toSellers: sum("Purchased", "upfrontPaid") + sum("Settled", "contingentToSeller"),
    escrowedNow: openContingent,
    refunded: sum("Settled", "contingentRefunded"),
    slashed: sum("Slashed", "amount"),
    toBuyersFromSlash: sum("Slashed", "toBuyers"),
    toPool: sum("Settled", "contingentToPool") + sum("Slashed", "toPool"),
  };
}
