// Resolver, odds and Merkle tests on recorded DOJ + CourtListener shapes. `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBasket, validTerm, termsFromCaption } from "./fca";
import { commitBasket, itemHash, itemLeaf, verifyProof } from "./merkle";
import { binomTail, suggestK, baseRate, signalRate } from "./odds";
import type { BasketItem, EvidencePackage } from "./package";

const ts = (d: string) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 1000);

// Recorded shapes (trimmed) from justice.gov/api/v1/press_releases.json and CourtListener v4 search (type=r).
const DOJ: Record<string, { title: string; date: string; url: string; body?: string; topic?: { name: string }[] }[]> = {
  lockheed: [
    { title: "Lockheed Martin Corporation Agrees to Settle False Claims Act Allegations of Defective Pricing", date: String(ts("2025-02-06")), url: "https://www.justice.gov/opa/pr/lockheed" },
    { title: "Lockheed Martin to Pay $1M in Export Case", date: String(ts("2025-02-10")), url: "https://www.justice.gov/opa/pr/lockheed-export" }, // no FCA context
  ],
  exactech: [{ title: "Exactech Agrees to Pay $8 Million to Resolve False Claims Act Allegations", date: String(ts("2024-12-01")), url: "https://www.justice.gov/x" }], // before commit
  siemens: [{ title: "Siemens Industry, Inc., to Pay Over $1 Million", date: String(ts("2025-02-03")), url: "https://www.justice.gov/s", body: "<p>…a qui tam lawsuit…</p>" }], // FCA via body
};
const DOCKETS = new Set([1001, 1002, 1003, 1004]); // everything else does not exist

function stubFetch() {
  globalThis.fetch = (async (input: string | URL) => {
    const u = new URL(String(input));
    if (u.hostname === "www.justice.gov") {
      const term = (u.searchParams.get("parameters[title]") ?? "").toLowerCase();
      return Response.json({ results: u.searchParams.get("page") === "0" ? DOJ[term] ?? [] : [] });
    }
    const id = Number((u.searchParams.get("q") ?? "").split(":")[1]);
    const date = u.searchParams.get("entry_date_filed_after");
    return Response.json({ results: DOCKETS.has(id) ? [{ docket_id: id, recap_documents: [{ entry_date_filed: date }] }] : [] });
  }) as typeof fetch;
}

const item = (defendant: string, matchTerms: string[], docketId: number, salt: string): BasketItem => ({
  defendant, matchTerms, court: "dcd", docketId, docketNumber: "1:24-cv-1", entryDate: "2025-01-20", entryText: "notice", courtlistenerURL: "https://cl/x", salt: `0x${salt.repeat(64)}` as `0x${string}`,
});

function basket(items: BasketItem[], k: number) {
  const pkg: EvidencePackage = {
    version: 2,
    claim: { teaser: "", teaserBody: "x", n: items.length, k, resolver: "DOJ_FCA", deadline: "2025-03-01T00:00:00Z" },
    items, entities: [], sources: [], analysis: "", seller: { agent: "t", version: "0" },
  };
  const onchain = { claimId: "0", n: items.length, k, itemsRoot: commitBasket(items).root, committedAt: ts("2025-01-25"), deadline: ts("2025-03-01"), exclusivityEnd: ts("2025-02-15") };
  return { pkg, onchain };
}

test("matchTerms: generic, short and boilerplate words are rejected", () => {
  assert.equal(validTerm("Lockheed"), true);
  assert.equal(validTerm("Health"), false);
  assert.equal(validTerm("Martin"), true);
  assert.equal(validTerm("Texas"), false);
  assert.equal(validTerm("Acme"), false); // < 6 chars
  assert.deepEqual(termsFromCaption("United States ex rel. Doe v. Lockheed Martin Corporation"), ["Lockheed", "Martin"]);
  assert.deepEqual(termsFromCaption("USA v. Home Health Care Services of Texas LLC"), []);
});

test("hit, miss, pre-commit release ignored, non-FCA release ignored, FCA via body", async () => {
  stubFetch();
  const items = [
    item("Lockheed Martin", ["Lockheed"], 1001, "1"), // FCA release 2025-02-06: hit
    item("Exactech", ["Exactech"], 1002, "2"), // release predates the commit: miss
    item("Siemens", ["Siemens"], 1003, "3"), // qui tam in the body: hit
    item("Home Health", ["Health", "Nobody"], 1004, "4"), // generic term ignored, no release: miss
  ];
  const { pkg, onchain } = basket(items, 2);
  const ev = await resolveBasket(pkg, onchain, ts("2025-03-02"));
  assert.equal(ev.outcome, "TRUE");
  assert.equal(ev.hitMask, String(0b0101));
  assert.equal(ev.hits, 2);
  assert.equal(ev.items[0].releaseURL, "https://www.justice.gov/opa/pr/lockheed");
  // Misses were revealed only because exclusivity ended; every leaf verifies against the committed root.
  for (const x of ev.items) {
    assert.ok(verifyProof(x.leaf, x.proof, onchain.itemsRoot));
    assert.equal(itemLeaf(x.index, itemHash(x.item!)), x.leaf);
  }
});

test("early: below k before the deadline is UNRESOLVED, and misses stay sealed during exclusivity", async () => {
  stubFetch();
  const items = [item("Lockheed Martin", ["Lockheed"], 1001, "1"), item("Exactech", ["Exactech"], 1002, "2")];
  const { pkg, onchain } = basket(items, 2);
  const ev = await resolveBasket(pkg, onchain, ts("2025-02-08"));
  assert.equal(ev.outcome, "UNRESOLVED");
  assert.equal(ev.items[0].defendant, "Lockheed Martin"); // hit: its release is already public
  assert.equal(ev.items[1].defendant, "sealed");
  assert.equal(ev.items[1].item, undefined);
  const after = await resolveBasket(pkg, onchain, ts("2025-03-02"));
  assert.equal(after.outcome, "FALSE");
});

test("fabricated: a cited docket entry that does not exist", async () => {
  stubFetch();
  const { pkg, onchain } = basket([item("Lockheed Martin", ["Lockheed"], 1001, "1"), item("Ghost Corp", ["Ghostly"], 999_999, "2")], 1);
  const ev = await resolveBasket(pkg, onchain, ts("2025-03-02"));
  assert.equal(ev.outcome, "FABRICATED");
  assert.match(ev.note, /999999/);
});

test("fabricated: basket swapped after commit (root mismatch)", async () => {
  stubFetch();
  const { pkg, onchain } = basket([item("Lockheed Martin", ["Lockheed"], 1001, "1")], 1);
  pkg.items[0] = { ...pkg.items[0], defendant: "Someone Else" };
  assert.equal((await resolveBasket(pkg, onchain, ts("2025-03-02"))).outcome, "FABRICATED");
});

test("merkle: odd-sized trees verify every leaf", () => {
  for (const n of [1, 2, 3, 5, 12, 64]) {
    const b = commitBasket(Array.from({ length: n }, (_, i) => ({ i, salt: `0x${"ab".repeat(32)}` })));
    for (let i = 0; i < n; i++) assert.ok(verifyProof(b.leaves[i], b.proof(i), b.root), `n=${n} i=${i}`);
  }
});

test("odds: binomial tail and suggested k", () => {
  assert.equal(binomTail(12, 0, 0.1), 1);
  assert.ok(Math.abs(binomTail(12, 1, 0.1) - (1 - 0.9 ** 12)) < 1e-12);
  assert.ok(Math.abs(binomTail(3, 3, 0.5) - 0.125) < 1e-12);
  assert.equal(suggestK(30, 0.1, 0.6), 2); // P(X >= 3) = 0.589 < 0.6
  assert.equal(suggestK(30, 0.1, 0.55), 3);
  assert.equal(baseRate(0), 0);
  assert.ok(signalRate(30) > baseRate(30));
  assert.equal(baseRate(90), baseRate(60)); // flat beyond the measured window
});
