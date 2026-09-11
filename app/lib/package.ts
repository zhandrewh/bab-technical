// The sealed good: a falsifiable claim plus its evidence trail. This is the plaintext inside the envelope.
export type ResolverId = "FEDREG" | "SAM" | "COURTLISTENER";

export type ClaimQuery =
  | { kind: "fedreg.published"; documentNumber: string } // resolves TRUE when the document is published in the FR
  | { kind: "sam.exclusion"; uei: string }
  | { kind: "courtlistener.docket"; docketId: string; pattern: string };

export type EvidencePackage = {
  version: 1;
  claim: {
    text: string; // human statement; keccak256(text) is the on-chain claimHash
    resolver: ResolverId;
    query: ClaimQuery;
    deadline: string; // ISO
  };
  entities: string[]; // normalized identifiers that go in the Bloom filter
  sources: { title: string; url: string; retrievedAt: string; note?: string }[];
  analysis: string;
  seller: { agent: string; version: string };
};
