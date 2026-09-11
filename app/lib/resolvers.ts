// Resolver adapters (spec 7). Whitelist only institutions indifferent to the contract.
// Each adapter: given a claim, return TRUE | FALSE | FABRICATED | UNRESOLVED plus an evidence URI.
import type { EvidencePackage } from "./package";

export type Resolution = {
  outcome: "TRUE" | "FALSE" | "FABRICATED" | "UNRESOLVED";
  evidenceURI: string;
  note: string;
  publicAt?: string; // when the finding reached the public record, if it has
};

const FR = "https://www.federalregister.gov/api/v1";

async function fedreg(pkg: EvidencePackage, now = new Date()): Promise<Resolution> {
  if (pkg.claim.query.kind !== "fedreg.published") throw new Error("bad query for FEDREG");
  const n = encodeURIComponent(pkg.claim.query.documentNumber);
  const deadline = new Date(pkg.claim.deadline);

  const doc = await fetch(`${FR}/documents/${n}.json?fields[]=publication_date&fields[]=html_url&fields[]=title`);
  if (doc.ok) {
    const d = await doc.json();
    const onTime = new Date(`${d.publication_date}T23:59:59Z`) <= deadline;
    return {
      outcome: onTime ? "TRUE" : "FALSE",
      evidenceURI: d.html_url,
      note: `published ${d.publication_date}${onTime ? "" : " (after deadline)"}`,
      publicAt: d.publication_date,
    };
  }
  const pi = await fetch(`${FR}/public-inspection-documents/${n}.json`);
  if (pi.ok) {
    const d = await pi.json();
    if (now > deadline) return { outcome: "FALSE", evidenceURI: d.html_url, note: "on public inspection but not published by deadline" };
    return { outcome: "UNRESOLVED", evidenceURI: d.html_url, note: `on public inspection; scheduled ${d.publication_date}` };
  }
  // Cited document exists in neither the Federal Register nor public inspection: fabricated evidence.
  return {
    outcome: "FABRICATED",
    evidenceURI: `https://www.federalregister.gov/documents/search?conditions[term]=${n}`,
    note: `document ${pkg.claim.query.documentNumber} does not exist in FR or public inspection`,
  };
}

async function sam(pkg: EvidencePackage): Promise<Resolution> {
  const key = process.env.SAM_API_KEY;
  if (!key || pkg.claim.query.kind !== "sam.exclusion") return { outcome: "UNRESOLVED", evidenceURI: "", note: "SAM_API_KEY not configured" };
  const res = await fetch(`https://api.sam.gov/entity-information/v4/exclusions?api_key=${key}&ueiSAM=${pkg.claim.query.uei}`);
  if (!res.ok) return { outcome: "UNRESOLVED", evidenceURI: "", note: `SAM ${res.status}` };
  const j = await res.json();
  const hit = (j.totalRecords ?? 0) > 0;
  return hit
    ? { outcome: "TRUE", evidenceURI: `https://sam.gov/search/?keywords=${pkg.claim.query.uei}`, note: "active exclusion found" }
    : { outcome: new Date() > new Date(pkg.claim.deadline) ? "FALSE" : "UNRESOLVED", evidenceURI: "", note: "no exclusion" };
}

async function courtlistener(pkg: EvidencePackage): Promise<Resolution> {
  const token = process.env.COURTLISTENER_TOKEN;
  if (!token || pkg.claim.query.kind !== "courtlistener.docket") return { outcome: "UNRESOLVED", evidenceURI: "", note: "COURTLISTENER_TOKEN not configured" };
  const q = pkg.claim.query;
  const res = await fetch(`https://www.courtlistener.com/api/rest/v4/docket-entries/?docket=${q.docketId}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) return { outcome: "UNRESOLVED", evidenceURI: "", note: `CourtListener ${res.status}` };
  const j = await res.json();
  const hit = (j.results ?? []).find((e: { description?: string }) => new RegExp(q.pattern, "i").test(e.description ?? ""));
  if (hit) return { outcome: "TRUE", evidenceURI: `https://www.courtlistener.com/docket/${q.docketId}/`, note: "matching docket entry" };
  return { outcome: new Date() > new Date(pkg.claim.deadline) ? "FALSE" : "UNRESOLVED", evidenceURI: "", note: "no matching entry" };
}

export const RESOLVERS = {
  FEDREG: { label: "Federal Register", resolve: fedreg, needsKey: false },
  SAM: { label: "SAM.gov exclusions", resolve: sam, needsKey: true },
  COURTLISTENER: { label: "CourtListener / RECAP", resolve: courtlistener, needsKey: true },
} as const;

export function resolve(pkg: EvidencePackage): Promise<Resolution> {
  return RESOLVERS[pkg.claim.resolver].resolve(pkg);
}
