// Reference seller agent: Federal Register public-inspection monitor.
//
// FORK ME. The shape every Verity seller agent follows:
//   1. poll a public source        -> fetchCandidates()
//   2. detect a pattern worth a claim -> scoreCandidate()
//   3. assemble an evidence package -> buildPackage()
//   4. encrypt, choose split/bond   -> priceClaim()
//   5. commit autonomously          -> commitClaim()
//
// Pattern: documents filed for public inspection are scheduled for publication, usually next business day. The
// seller's edge is aggregation — watching ~100 filings a day across every agency and flagging the ones touching
// a buyer's beat (contracting, enforcement, exclusions) before the formal publication lands. The claim names the
// institution that can prove it wrong: the Federal Register itself. Resolves in about a day.
//
// Usage: tsx scripts/seller-fedreg.ts [--once] [--max=N] [--backfill]
//   --backfill picks filings from the most recent *already-published* issue so a demo can settle TRUE in minutes.
//   These are labeled "backfill" in the claim text — they demonstrate settlement, not forecasting edge.
import { log, dim, wallet, send, ensureAllowance, publicClient } from "./env";
import { marketAbi } from "../lib/abi";
import { MARKET, CUSTODIAN_PUBKEY, usd } from "../lib/chain";
import { encryptPackage, hashText } from "../lib/crypto";
import { buildBloom, normalizeEntity } from "../lib/bloom";
import { storeEnvelope } from "../lib/storage";
import type { EvidencePackage } from "../lib/package";
import { stringToHex } from "viem";

const FR = "https://www.federalregister.gov/api/v1";
const AGENT = { agent: "verity-fedreg-monitor", version: "0.1.0" };

type PI = {
  document_number: string;
  title: string;
  type: string;
  agencies: { slug: string; name: string }[];
  docket_numbers: string[];
  publication_date: string;
  filed_at: string;
  html_url: string;
  pdf_url: string;
  num_pages: number;
  filing_type: string;
};

// Words that make a filing interesting to accountability buyers (contracting, enforcement, exclusion, penalties).
const SIGNALS = /(debar|suspen|exclusion|penalt|enforcement|settlement|contract|procurement|grant|waiver|emergency|recall|revocation|civil money|termination)/i;

async function fetchCandidates(backfill: boolean): Promise<PI[]> {
  if (!backfill) {
    const j = await (await fetch(`${FR}/public-inspection-documents/current.json`)).json();
    return j.results as PI[];
  }
  // Most recent issue that has already been published: documents we can resolve right now.
  const today = new Date().toISOString().slice(0, 10);
  const j = await (await fetch(`${FR}/documents.json?per_page=100&order=newest&conditions[publication_date][lte]=${today}&fields[]=document_number&fields[]=title&fields[]=type&fields[]=agencies&fields[]=docket_ids&fields[]=publication_date&fields[]=html_url&fields[]=pdf_url&fields[]=page_length`)).json();
  return (j.results as Record<string, unknown>[]).map((d) => ({
    document_number: d.document_number as string,
    title: d.title as string,
    type: d.type as string,
    agencies: (d.agencies as { slug: string; name: string }[]) ?? [],
    docket_numbers: (d.docket_ids as string[]) ?? [],
    publication_date: d.publication_date as string,
    filed_at: "",
    html_url: d.html_url as string,
    pdf_url: d.pdf_url as string,
    num_pages: (d.page_length as number) ?? 1,
    filing_type: "published",
  }));
}

function scoreCandidate(d: PI): number {
  let s = 0;
  if (SIGNALS.test(d.title)) s += 3;
  if (d.type === "Rule" || d.type === "Proposed Rule") s += 2;
  if (d.docket_numbers?.length) s += 1;
  if (d.num_pages > 5) s += 1;
  return s;
}

function buildPackage(d: PI, backfill: boolean, deadline: Date): EvidencePackage {
  const agencies = d.agencies.map((a) => a.name).join(", ") || "an agency";
  const entities = [
    ...d.agencies.map((a) => `agency:${normalizeEntity(a.slug)}`),
    ...(d.docket_numbers ?? []).map((k) => `docket:${normalizeEntity(k)}`),
    `frdoc:${d.document_number}`,
  ];
  return {
    version: 1,
    claim: {
      text: `${backfill ? "[backfill] " : ""}${agencies} document ${d.document_number} ("${d.title.slice(0, 140)}") will be published in the Federal Register by ${deadline.toISOString().slice(0, 10)}.`,
      resolver: "FEDREG",
      query: { kind: "fedreg.published", documentNumber: d.document_number },
      deadline: deadline.toISOString(),
    },
    entities,
    sources: [
      { title: `Public inspection filing ${d.document_number}`, url: d.html_url, retrievedAt: new Date().toISOString() },
      { title: "Filed PDF", url: d.pdf_url, retrievedAt: new Date().toISOString(), note: `${d.num_pages} pages` },
      ...(d.docket_numbers ?? []).map((k) => ({ title: `Docket ${k}`, url: `https://www.regulations.gov/docket/${encodeURIComponent(k)}`, retrievedAt: new Date().toISOString() })),
    ],
    analysis: [
      `Filing type: ${d.type} (${d.filing_type}). Scheduled publication: ${d.publication_date}.`,
      `Agencies: ${agencies}. Dockets: ${(d.docket_numbers ?? []).join(", ") || "none listed"}.`,
      `Why it matters: ${SIGNALS.test(d.title) ? `title matches accountability signal "${d.title.match(SIGNALS)?.[0]}"` : "agency action on the buyer's beat"}.`,
      `Resolution: the Federal Register API returns this document number with a publication_date on or before the deadline.`,
    ].join("\n"),
    seller: AGENT,
  };
}

/** Scaled 1000x for testnet faucets: $0.18 on the UI means $180 in production. */
function priceClaim(score: number) {
  const confidence = Math.min(9500, 8000 + score * 300); // public-inspection filings almost always publish
  const upfrontBps = confidence > 9000 ? 1000 : 2500; // confident sellers take less upfront (spec 2.6)
  const total = 1_780_000n; // $1.78 total ask
  const upfront = (total * BigInt(upfrontBps)) / 10_000n;
  const contingent = total - upfront;
  const bond = upfront * 7n > 1_000_000n ? upfront * 7n : 1_000_000n; // bond as costly signal, 7x upfront
  return { confidence, upfront, contingent, bond };
}

export async function commitClaim(pkg: EvidencePackage, pricing: ReturnType<typeof priceClaim>, exclusivitySeconds: bigint, domain: string, role: "SELLER" | "FABRICATOR" = "SELLER") {
  const w = wallet(role);
  const pkgJson = JSON.stringify(pkg);
  const { envelopeJson, payloadHash } = await encryptPackage(pkgJson, CUSTODIAN_PUBKEY);
  const payloadURI = await storeEnvelope(envelopeJson);
  dim(`encrypted ${pkgJson.length}B package -> ${payloadURI.slice(0, 48)}… payloadHash ${payloadHash.slice(0, 18)}…`);

  await ensureAllowance(role, MARKET, pricing.bond);
  const attestation = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "ATTESTATION" });
  const params = {
    claimHash: hashText(pkg.claim.text),
    payloadHash,
    resolverId: stringToHex(pkg.claim.resolver, { size: 32 }),
    deadline: BigInt(Math.floor(new Date(pkg.claim.deadline).getTime() / 1000)),
    exclusivitySeconds,
    upfront: pricing.upfront,
    contingent: pricing.contingent,
    bond: pricing.bond,
    confidenceBps: pricing.confidence,
    domain: stringToHex(domain.slice(0, 31), { size: 32 }),
    attestation,
    payloadURI,
    bloom: buildBloom(pkg.entities),
  };
  const { result: claimId } = await publicClient.simulateContract({ account: w.account, address: MARKET, abi: marketAbi, functionName: "commit", args: [params] });
  await send(role.toLowerCase(), `commit claim #${claimId} (bond ${usd(pricing.bond)})`, w.writeContract({ address: MARKET, abi: marketAbi, functionName: "commit", args: [params] }));
  return claimId;
}

export async function runSeller(opts: { backfill?: boolean; max?: number; exclusivitySeconds?: bigint; deadlineHours?: number } = {}) {
  const backfill = !!opts.backfill;
  log("seller", `polling Federal Register ${backfill ? "(backfill: already-published issue)" : "public inspection"}…`);
  const docs = await fetchCandidates(backfill);
  const ranked = docs.map((d) => ({ d, s: scoreCandidate(d) })).sort((a, b) => b.s - a.s).slice(0, opts.max ?? 1);
  log("seller", `${docs.length} filings scanned; ${ranked.length} worth a claim`);
  const ids: bigint[] = [];
  for (const { d, s } of ranked) {
    const deadline = new Date(Date.now() + (opts.deadlineHours ?? 48) * 3600_000);
    const pkg = buildPackage(d, backfill, deadline);
    const pricing = priceClaim(s);
    const agency = d.agencies[0]?.slug?.split("-").slice(0, 3).join("-") ?? "misc";
    log("seller", `claim: ${pkg.claim.text}`);
    dim(`confidence ${(pricing.confidence / 100).toFixed(0)}% · ${usd(pricing.upfront)} upfront + ${usd(pricing.contingent)} contingent · bond ${usd(pricing.bond)}`);
    ids.push(await commitClaim(pkg, pricing, opts.exclusivitySeconds ?? 24n * 3600n, `fedreg:${agency}`));
  }
  return ids;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const max = Number(args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? 1);
  runSeller({ backfill: args.includes("--backfill"), max }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
