// Ledger graph layout: lanes branch at Committed, merge at the claim's last settlement event, and are reused. `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedger } from "./ledger";
import type { FeedEvent } from "./events";
import type { ClaimView } from "./claims";

let block = 100;
const ev = (kind: string, claimId: string | undefined, args: Record<string, unknown>, sameTx = false): FeedEvent => {
  if (!sameTx) block += 10;
  return { kind, contract: "market", claimId, tx: `0xtx${block}`, block: String(block), logIndex: sameTx ? 1 : 0, ts: block * 2, args: { claimId, ...args } };
};
const money = { upfront: "178000", contingent: "1602000", bond: "1246000" };

const events: FeedEvent[] = [
  ev("OwnershipTransferred", undefined, { newOwner: "0xowner" }),
  ev("ResolverSet", undefined, { resolverId: "0x444f4a5f464341000000000000000000000000000000000000000000000000000", allowed: true, replay: false }),
  ev("Committed", "0", { seller: "0xseller", teaser: "3 of 12 sealed cases", ...money }),
  ev("Committed", "1", { seller: "0xfab", teaser: "4 of 6 sealed cases", ...money }),
  ev("Purchased", "1", { buyer: "0xbuyer", payer: "0xrelayer", upfrontPaid: "178000", contingentEscrowed: "1602000" }),
  ev("Proposed", "1", { proposer: "0xoracle", outcome: 3, hitMask: "0" }),
  ev("Settled", "1", { outcome: 3, hits: 0, publicByDeadline: false, contingentToSeller: "0", contingentToPool: "0", contingentRefunded: "1602000", bondReturned: "0", bondSlashed: "1246000" }),
  ev("Slashed", "1", { seller: "0xfab", outcome: 3, amount: "1246000", toBuyers: "178000", toPool: "1068000" }, true),
  ev("Committed", "2", { seller: "0xseller", teaser: "2 of 8 sealed cases", ...money }),
];

const claim = (id: string, exclusivityEnd: number, status: ClaimView["status"]) => ({ id, exclusivityEnd, status, contingent: "1602000", buyers: 1 }) as ClaimView;

test("lanes branch at commit, merge at the last settlement event, and are reused", () => {
  const L = buildLedger(events, [], "0xrelayer", 0);
  const byKey = (kind: string, claimId?: string) => L.rows.find((r) => r.kind === kind && r.claimId === claimId)!;
  assert.equal(byKey("Committed", "0").lane, 1);
  assert.equal(byKey("Committed", "1").lane, 2);
  assert.equal(byKey("Committed", "0").branches, true);
  assert.equal(byKey("Slashed", "1").merges, true, "the merge is the last event of the settled claim");
  assert.equal(byKey("Settled", "1").merges, false);
  assert.equal(byKey("Committed", "2").lane, 2, "claim 1 merged, so its lane is free for claim 2");
  assert.equal(byKey("Purchased", "1").tag, "x402 buy", "payer == relayer marks an agent purchase");
  assert.equal(byKey("OwnershipTransferred").lane, 0);
  assert.equal(L.lanes, 3);
  assert.equal(L.rows[0].kind, "Committed", "newest first");
});

test("spans are in display order and an open lane runs to the top", () => {
  const L = buildLedger(events, [], undefined, 0);
  const s0 = L.spans.find((s) => s.claimId === "0")!;
  const s1 = L.spans.find((s) => s.claimId === "1")!;
  assert.equal(s0.from, 0, "still open: reaches row 0");
  assert.equal(L.rows[s0.to].kind, "Committed");
  assert.equal(L.rows[s1.from].kind, "Slashed");
  assert.equal(L.rows[s1.to].kind, "Committed");
  assert.ok(s1.from < s1.to);
  assert.equal(s0.merged, false);
  assert.equal(s1.merged, true);
  assert.equal(s1.tone, "danger");
});

test("an expired exclusivity window adds a derived key-open node on the claim's lane", () => {
  const L = buildLedger(events, [claim("0", 130 * 2 + 1, "OPEN"), claim("2", 10_000, "OPEN"), claim("1", 122 * 2, "SETTLED")], undefined, 5_000);
  const open = L.rows.filter((r) => r.kind === "KeyOpen");
  assert.equal(open.length, 2, "claim 2's window has not ended; claim 1's lane merged after its window so it is included");
  const k0 = open.find((r) => r.claimId === "0")!;
  assert.equal(k0.lane, 1);
  assert.equal(k0.derived, true);
  assert.equal(k0.tx, undefined);
});

test("totals follow the money", () => {
  const L = buildLedger(events, [claim("0", 0, "OPEN")], undefined, 0);
  assert.equal(L.totals.claims, 3);
  assert.equal(L.totals.settled, 1);
  assert.equal(L.totals.slashed, 1_246_000n);
  assert.equal(L.totals.toBuyersFromSlash, 178_000n);
  assert.equal(L.totals.refunded, 1_602_000n);
  assert.equal(L.totals.toSellers, 178_000n);
  assert.equal(L.totals.toPool, 1_068_000n);
  assert.equal(L.totals.escrowedNow, 1_602_000n);
});
