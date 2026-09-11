// Reference seller agent: sealed False Claims Act dockets -> k-of-N basket.
//
// FORK ME. The shape every Verity seller agent follows:
//   1. read a public source           -> findNotices()   CourtListener RECAP: "the United States elects to intervene
//                                                          for purposes of settlement" in a qui tam case
//   2. keep only what is still news   -> toItem()        drop cases DOJ has already announced; build matchTerms
//   3. size the claim honestly        -> priceBasket()   largest k the backtested hit rate supports at >= confidence
//   4. salt, merklize, encrypt        -> commitClaim()   itemsRoot + sealed envelope; the contract writes "k of n"
//
// Edge (research/backtest-fca.py): these notices precede a DOJ settlement release naming the defendant far more often
// than a declined case does. The buyer pays for WHICH cases; the count and the odds are public.
//
// Usage: tsx scripts/seller-fca.ts [--n=12] [--days=30] [--replay]
//   --replay builds a basket from backtested notices whose outcome is already history, on DOJ_FCA_REPLAY. It settles in
//   minutes, pays out normally, and is excluded from the seller's record and lift. It demonstrates settlement, not edge.
import fs from "node:fs";
import path from "node:path";
import { stringToHex } from "viem";
import { log, dim, wallet, send, ensureAllowance, publicClient, retry } from "./env";
import { marketAbi } from "../lib/abi";
import { MARKET, CUSTODIAN_PUBKEY, usd } from "../lib/chain";
import { encryptPackage } from "../lib/crypto";
import { buildBloom } from "../lib/bloom";
import { storeEnvelope } from "../lib/storage";
import { commitBasket, randomSalt } from "../lib/merkle";
import { binomTail, sharpness, signalRate, suggestK, fmtOdds } from "../lib/odds";
import { basketEntities, defendantSide, releasesNaming, namesAny, termsFromCaption } from "../lib/fca";
import type { BasketItem, EvidencePackage, ResolverId } from "../lib/package";

const AGENT = { agent: "verity-fca-docket-reader", version: "0.2.0" };
const CL = "https://www.courtlistener.com/api/rest/v4/search/";
const NOTICE_Q = '("purposes of settlement" OR "settlement purposes") AND "intervene" AND "False Claims"';
const DAY = 86_400;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type RecapResult = {
  caseName: string;
  court?: string;
  court_id?: string;
  docket_id: number;
  docketNumber?: string;
  docket_absolute_url?: string;
  recap_documents?: { entry_date_filed?: string; description?: string; short_description?: string }[];
};

async function findNotices(sinceDays: number): Promise<RecapResult[]> {
  const after = new Date(Date.now() - sinceDays * DAY * 1000).toISOString().slice(0, 10);
  const token = process.env.COURTLISTENER_TOKEN;
  let url: string | null = `${CL}?${new URLSearchParams({ type: "r", q: NOTICE_Q, order_by: "entry_date_filed desc", entry_date_filed_after: after })}`;
  const out: RecapResult[] = [];
  for (let page = 0; url && page < 4; page++) {
    const r: Response = await fetch(url, { headers: { "User-Agent": "verity-seller/0.2", ...(token ? { Authorization: `Token ${token}` } : {}) } });
    if (!r.ok) throw new Error(`CourtListener ${r.status}`);
    const j: { results: RecapResult[]; next: string | null } = await r.json();
    out.push(...j.results);
    url = j.next;
  }
  return out;
}

/** A still-sealed, still-unannounced case with at least one distinctive name to match on. */
async function toItem(r: RecapResult): Promise<BasketItem | null> {
  const e = (r.recap_documents ?? [])
    .filter((d) => d.entry_date_filed && /settlement/i.test(`${d.description ?? ""} ${d.short_description ?? ""}`))
    .sort((a, b) => a.entry_date_filed!.localeCompare(b.entry_date_filed!))[0];
  const matchTerms = termsFromCaption(r.caseName ?? "");
  if (!e || !matchTerms.length) return null;
  // Already announced? Then there is nothing to forecast — and the release predates the commit, so it could not hit.
  const since = Date.parse(e.entry_date_filed!) / 1000 - 120 * DAY;
  for (const t of matchTerms) if ((await releasesNaming(t)).some((x) => x.fca && x.date > since && namesAny(x.title, matchTerms))) return null;
  return {
    defendant: defendantSide(r.caseName).slice(0, 120),
    matchTerms,
    court: r.court ?? r.court_id ?? "",
    docketId: Number(r.docket_id),
    docketNumber: r.docketNumber ?? "",
    entryDate: e.entry_date_filed!.slice(0, 10),
    entryText: (e.description || e.short_description || "").slice(0, 400).trim(),
    courtlistenerURL: `https://www.courtlistener.com${r.docket_absolute_url ?? `/docket/${r.docket_id}/`}`,
    salt: randomSalt(),
  };
}

/** Scaled 1000x for testnet faucets: $1.78 on the UI means $1,780 in production. */
export function priceBasket(confidence: number) {
  const upfrontBps = confidence >= 0.8 ? 1000 : 2500; // confident sellers take less upfront (spec 2.6)
  const total = 1_780_000n;
  const upfront = (total * BigInt(upfrontBps)) / 10_000n;
  const bond = upfront * 7n > 1_000_000n ? upfront * 7n : 1_000_000n; // bond as costly signal, >= 7x upfront
  return { confidence: Math.round(confidence * 10_000), upfront, contingent: total - upfront, bond };
}

export async function commitClaim(
  pkg: EvidencePackage,
  pricing: ReturnType<typeof priceBasket>,
  exclusivitySeconds: bigint,
  domain: string,
  role: "SELLER" | "FABRICATOR" = "SELLER",
) {
  const w = wallet(role);
  const { root } = commitBasket(pkg.items);
  const pkgJson = JSON.stringify(pkg);
  const { envelopeJson, payloadHash } = await encryptPackage(pkgJson, CUSTODIAN_PUBKEY);
  const payloadURI = await storeEnvelope(envelopeJson);
  dim(`encrypted ${pkgJson.length}B basket -> ${payloadURI.slice(0, 48)}… itemsRoot ${root.slice(0, 18)}…`);

  await ensureAllowance(role, MARKET, pricing.bond);
  const attestation = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "ATTESTATION" });
  const params = {
    n: pkg.claim.n,
    k: pkg.claim.k,
    itemsRoot: root,
    teaserBody: pkg.claim.teaserBody,
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
  const { result: claimId } = await retry("simulate commit", () =>
    publicClient.simulateContract({ account: w.account, address: MARKET, abi: marketAbi, functionName: "commit", args: [params] }),
  );
  await send(role.toLowerCase(), `commit basket #${claimId} (bond ${usd(pricing.bond)})`, w.writeContract({ address: MARKET, abi: marketAbi, functionName: "commit", args: [params] }));
  return claimId;
}

function buildPackage(items: BasketItem[], k: number, resolver: ResolverId, deadline: Date, teaserBody: string, analysis: string[], windowDays?: number): EvidencePackage {
  return {
    version: 2,
    claim: { teaser: `${k} of ${items.length} ${teaserBody}`, teaserBody, n: items.length, k, resolver, deadline: deadline.toISOString(), windowDays },
    items,
    entities: basketEntities(items),
    sources: items.map((it) => ({ title: `${it.defendant} · ${it.docketNumber} (${it.entryDate})`, url: it.courtlistenerURL, retrievedAt: new Date().toISOString() })),
    analysis: analysis.join("\n"),
    seller: AGENT,
  };
}

/** Backtest pairs with an outcome already on the record (research/fca-pairs.json). */
function replayItems(hits: number, misses: number): BasketItem[] {
  const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, "../../research/fca-pairs.json"), "utf8")) as (Omit<BasketItem, "salt"> & { hit: boolean })[];
  const pick = (h: boolean, count: number) => pairs.filter((p) => p.hit === h && p.docketId && p.matchTerms.length).slice(0, count);
  return [...pick(true, hits), ...pick(false, misses)]
    .map(({ defendant, matchTerms, court, docketId, docketNumber, entryDate, entryText, courtlistenerURL }) => ({
      defendant, matchTerms, court: court ?? "", docketId: Number(docketId), docketNumber: docketNumber ?? "", entryDate, entryText, courtlistenerURL, salt: randomSalt(),
    }))
    .sort((a, b) => a.salt.localeCompare(b.salt)); // shuffle: position must not leak which items hit
}

export async function runSeller(opts: { n?: number; days?: number; replay?: boolean; exclusivitySeconds?: bigint } = {}) {
  // A replay's items each resolve over 60 days of history, so its listing window (and odds) is 60 days too.
  const days = opts.days ?? (opts.replay ? 60 : 30);
  const deadline = new Date(Date.now() + days * DAY * 1000);
  let items: BasketItem[];
  let k: number;
  let pricing: ReturnType<typeof priceBasket>;
  let pkg: EvidencePackage;

  if (opts.replay) {
    items = replayItems(4, 6);
    k = 3;
    const body = `backtest FCA cases (notices ${items.map((i) => i.entryDate).sort()[0].slice(0, 7)} on) drew a DOJ settlement release within 60 days · replay`;
    // Stated confidence is what the backtested signal rate implies for this basket, not the known answer.
    pricing = priceBasket(binomTail(items.length, k, signalRate(60)));
    pkg = buildPackage(items, k, "DOJ_FCA_REPLAY", deadline, body, [
      "REPLAY: every item is a historical settlement-intervention notice from research/fca-pairs.json.",
      "Each item's window is (notice date, notice date + 60 days]. The outcome is already on the public record.",
      "This basket demonstrates settlement mechanics; the contract excludes it from the seller's record and lift.",
    ], 60);
    log("seller", `replay basket: ${items.length} historical notices`);
  } else {
    log("seller", "searching RECAP for settlement-intervention notices (last 45 days)…");
    const notices = await findNotices(45);
    const seen = new Set<number>();
    items = [];
    for (const r of notices) {
      if (items.length >= (opts.n ?? 12) || seen.has(Number(r.docket_id))) continue;
      seen.add(Number(r.docket_id));
      const it = await toItem(r).catch(() => null);
      if (it) items.push(it);
    }
    log("seller", `${notices.length} notices scanned; ${items.length} still sealed and unannounced`);
    if (items.length < 2) throw new Error("not enough fresh notices for a basket");
    const p = signalRate(days);
    k = suggestK(items.length, p, 0.6);
    pricing = priceBasket(binomTail(items.length, k, p));
    pkg = buildPackage(items, k, "DOJ_FCA", deadline, `sealed federal fraud cases will produce a DOJ settlement release by ${day(deadline)}`, [
      `Signal: each item is a docket entry in which the United States elects to intervene in a qui tam case for purposes of settlement.`,
      `Backtest (research/fca-baseline.json): ${Math.round(signalRate(60) * 100)}% of such notices drew a DOJ release naming the defendant within 60 days, vs ${Math.round(sharpness(1, 1, 60).p0 * 100)}% for declined cases.`,
      `Per-item rate over this ${days}-day window: ${(p * 100).toFixed(1)}%. P(at least ${k} of ${items.length}) = ${fmtOdds(binomTail(items.length, k, p))}.`,
      `Resolution: justice.gov press releases after the commit, FCA context, title naming a matchTerm.`,
    ]);
  }

  const s = sharpness(items.length, k, days);
  log("seller", `claim: ${pkg.claim.teaser}`);
  dim(`expected by chance ${s.expected.toFixed(1)} of ${items.length} · random-basket odds ${fmtOdds(s.randomOdds)} · stated confidence ${(pricing.confidence / 100).toFixed(0)}%`);
  dim(`${usd(pricing.upfront)} upfront + ${usd(pricing.contingent)} contingent · bond ${usd(pricing.bond)}`);
  const exclusivity = opts.exclusivitySeconds ?? BigInt(Math.floor((days * DAY) / 2)); // opens before the deadline: publication guaranteed
  return commitClaim(pkg, pricing, exclusivity, opts.replay ? "fca:replay" : "fca:federal");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  runSeller({ n: Number(arg("n") ?? 12), days: arg("days") ? Number(arg("days")) : undefined, replay: args.includes("--replay") })
    .then((id) => log("seller", `committed #${id}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
