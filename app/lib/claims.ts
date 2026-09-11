// Read model: joins Committed events with live contract state. Shared by pages and the agent API.
import { hexToString, type Hex } from "viem";
import { marketAbi } from "./abi";
import { MARKET, OUTCOMES, STATUSES, publicClient } from "./chain";
import { getAllEvents, type FeedEvent } from "./events";
import { calibrationFrom } from "./calibration";
import { bloomSimilarity } from "./bloom";
import { BLOCK_MS, memoFor } from "./memo";

export type ClaimView = {
  id: string;
  seller: string;
  claimHash: string;
  payloadHash: string;
  payloadURI: string;
  resolver: string;
  domain: string;
  committedAt: number;
  commitTx: string;
  deadline: number;
  exclusivityEnd: number;
  publishedAt: number;
  upfront: string;
  contingent: string;
  currentUpfront: string;
  bond: string;
  bondMultiple: number;
  upfrontShare: number;
  confidence: number;
  status: (typeof STATUSES)[number];
  outcome: (typeof OUTCOMES)[number];
  proposed: (typeof OUTCOMES)[number];
  proposedAt: number;
  buyers: number;
  bloom: Hex;
  novelty: number; // count of prior open commits with overlapping entities (hard rule 5)
  sellerBrier: number | null;
  sellerSettled: number;
};

const s32 = (h: Hex) => hexToString(h, { size: 32 }).replace(/\0/g, "");

/** Shared across callers within one block (e.g. the claim page loads the market, then the event log). */
export const loadMarket = memoFor(BLOCK_MS, buildMarket);

async function buildMarket(): Promise<{ claims: ClaimView[]; events: FeedEvent[] }> {
  const events = await getAllEvents();
  const commits = events.filter((e) => e.kind === "Committed");
  if (!commits.length) return { claims: [], events };
  const cal = calibrationFrom(events);
  const reads = await publicClient.multicall({
    contracts: commits.flatMap((e) => [
      { address: MARKET, abi: marketAbi, functionName: "getClaim", args: [BigInt(e.claimId!)] },
      { address: MARKET, abi: marketAbi, functionName: "currentUpfront", args: [BigInt(e.claimId!)] },
    ]),
    allowFailure: true,
  });
  const claims: ClaimView[] = commits.map((e, i) => {
    const c = reads[i * 2].result as { status: number; outcome: number; proposed: number; proposedAt: bigint; publishedAt: bigint; buyerCount: number; committedAt: bigint } | undefined;
    const cur = reads[i * 2 + 1].result as bigint | undefined;
    const a = e.args as Record<string, string>;
    const up = BigInt(a.upfront), cont = BigInt(a.contingent), bond = BigInt(a.bond);
    const sc = cal.get(a.seller.toLowerCase());
    return {
      id: e.claimId!,
      seller: a.seller,
      claimHash: a.claimHash,
      payloadHash: a.payloadHash,
      payloadURI: a.payloadURI,
      resolver: s32(a.resolverId as Hex),
      domain: s32(a.domain as Hex),
      committedAt: c ? Number(c.committedAt) : e.ts,
      commitTx: e.tx,
      deadline: Number(a.deadline),
      exclusivityEnd: Number(a.exclusivityEnd),
      publishedAt: c ? Number(c.publishedAt) : 0,
      upfront: a.upfront,
      contingent: a.contingent,
      currentUpfront: (cur ?? up).toString(),
      bond: a.bond,
      bondMultiple: up > 0n ? Number((bond * 10n) / up) / 10 : 0,
      upfrontShare: Number(up) / Number(up + cont),
      confidence: Number(a.confidenceBps) / 10_000,
      status: STATUSES[c?.status ?? 0],
      outcome: OUTCOMES[c?.outcome ?? 0],
      proposed: OUTCOMES[c?.proposed ?? 0],
      proposedAt: c ? Number(c.proposedAt) : 0,
      buyers: c?.buyerCount ?? 0,
      bloom: a.bloom as Hex,
      novelty: 0,
      sellerBrier: sc?.brier ?? null,
      sellerSettled: sc?.n ?? 0,
    };
  });
  // Novelty: prior commits (earlier id) still unsettled whose entity filters overlap substantially.
  for (const c of claims) {
    c.novelty = claims.filter((p) => Number(p.id) < Number(c.id) && p.status !== "SETTLED" && bloomSimilarity(p.bloom, c.bloom) > 0.3).length;
  }
  return { claims: claims.reverse(), events };
}

export async function loadClaim(id: string) {
  const { claims, events } = await loadMarket();
  const claim = claims.find((c) => c.id === id) ?? null;
  return { claim, events: events.filter((e) => e.claimId === id), all: claims };
}
