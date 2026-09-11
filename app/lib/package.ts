// The sealed good (v2): a k-of-N basket. The headline "{k} of {n} …" is public and composed on chain; which items
// is sealed. Each item is committed under the on-chain itemsRoot (lib/merkle.ts), salted so it cannot be guessed.
import type { Hex } from "viem";

export type ResolverId = "DOJ_FCA" | "DOJ_FCA_REPLAY";

/** One sealed FCA case. Field order is irrelevant: the hash is over canonical JSON. */
export type BasketItem = {
  defendant: string;
  matchTerms: string[]; // a DOJ release title must contain one (word boundary, case-insensitive); >= 6 chars, not generic
  court: string;
  docketId: number;
  docketNumber: string;
  entryDate: string; // YYYY-MM-DD of the cited notice
  entryText: string; // the cited docket entry, verbatim
  courtlistenerURL: string;
  salt: Hex;
};

export type EvidencePackage = {
  version: 2;
  claim: {
    teaser: string; // exactly the on-chain teaser, "{k} of {n} …"
    teaserBody: string;
    n: number;
    k: number;
    resolver: ResolverId;
    deadline: string; // ISO
    // Replay only: each item's window is (entryDate, entryDate + windowDays]; the basket settles on history.
    windowDays?: number;
  };
  items: BasketItem[];
  entities: string[]; // normalized identifiers that go in the Bloom filter
  sources: { title: string; url: string; retrievedAt: string; note?: string }[];
  analysis: string;
  seller: { agent: string; version: string };
};

/** What the oracle publishes as evidenceURI, and what the claim page renders after reveal. */
export type BasketEvidence = {
  claimId: string;
  resolver: ResolverId;
  checkedAt: string;
  outcome: "TRUE" | "FALSE" | "FABRICATED" | "UNRESOLVED";
  hitMask: string;
  hits: number;
  note: string;
  items: {
    index: number;
    defendant: string;
    hit: boolean;
    releaseURL?: string;
    releaseTitle?: string;
    releaseDate?: string;
    docketOk?: boolean;
    item?: BasketItem; // full salted item when revealed, so anyone can recompute its leaf
    leaf: Hex;
    proof: Hex[];
  }[];
};
