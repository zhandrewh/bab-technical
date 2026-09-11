// DOJ_FCA resolver (spec 2). Keyless: justice.gov press releases + CourtListener RECAP search.
//
// Item i HITS iff some DOJ release R has
//   1. a date inside the item's window: (committedAt, min(deadline, now)]  — replay: (entryDate, entryDate + windowDays]
//   2. FCA context: a "False Claims Act" topic, "False Claims" in the title, or "qui tam" in the body
//   3. a title naming one of the item's valid matchTerms (word boundary, case-insensitive)
// The claim is FABRICATED iff the basket does not match itemsRoot, or any cited docket entry does not exist.
import stoplist from "./fca-stoplist.json";
import { commitBasket } from "./merkle";
import type { BasketEvidence, BasketItem, EvidencePackage } from "./package";

const GENERIC = new Set([...stoplist.boilerplate, ...stoplist.generic]);
const DOJ = "https://www.justice.gov/api/v1/press_releases.json";
const CL = "https://www.courtlistener.com/api/rest/v4/search/";
const UA = { "User-Agent": "verity-oracle/0.2" };
const DAY = 86_400;

/** A term that could name one defendant: >= 6 letters and not a sector, place or boilerplate word. */
export const validTerm = (t: string) => t.length >= 6 && /^[A-Za-z][A-Za-z'&.-]*$/.test(t) && !GENERIC.has(t.toLowerCase());

/** The defendant side of a caption ("United States ex rel. Doe v. Acme Corp" -> "Acme Corp"). */
export function defendantSide(caseName: string): string {
  const parts = caseName.split(/\bv\.?s?\.?\b/i);
  const side = parts.length > 1 ? parts.slice(1).join(" ") : caseName;
  return (/united states|usa|america/i.test(side) ? parts[0] : side).replace(/^[\s,.]+|[\s,.]+$/g, "");
}

/** Up to two distinctive tokens from the defendant side of a caption. Mirrors research/backtest-fca.py. */
export function termsFromCaption(caseName: string): string[] {
  const toks = (defendantSide(caseName).match(/[A-Za-z][A-Za-z'&-]{2,}/g) ?? []).filter((t) => !stoplist.boilerplate.includes(t.toLowerCase()));
  return toks.filter(validTerm).slice(0, 2);
}

export type Release = { title: string; date: number; url: string; fca: boolean };

/** Bloom entities for a basket: each matchTerm and the court. A buyer's watchlist uses the same normalization. */
export const basketEntities = (items: BasketItem[]) =>
  [...new Set(items.flatMap((it) => [...it.matchTerms.map((t) => `defendant:${t.toLowerCase()}`), `court:${it.court.trim().toLowerCase().replace(/\s+/g, "-")}`]))];

const TTL_MS = 10 * 60_000; // the oracle polls; DOJ publishes a few times a day
const cache = new Map<string, { at: number; p: Promise<Release[]> }>();

async function getJson(url: string, headers: Record<string, string> = {}) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { ...UA, ...headers } }).catch((e) => e as Error);
    if (!(r instanceof Error) && r.ok) return r.json();
    if (i >= 3) throw new Error(`${url.slice(0, 80)}: ${r instanceof Error ? r.message : r.status}`);
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
}

/** Recent DOJ releases whose title contains `term` (the API filter is a substring match; we re-check boundaries). */
export function releasesNaming(term: string): Promise<Release[]> {
  const key = term.toLowerCase();
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    cache.set(key, {
      at: Date.now(),
      p: (async () => {
        const out: Release[] = [];
        for (let page = 0; page < 3; page++) {
          const j = await getJson(`${DOJ}?pagesize=50&page=${page}&sort=date&direction=DESC&parameters%5Btitle%5D=${encodeURIComponent(term)}`);
          // `topic` arrives as an array, a single object, or empty depending on the release; match on its serialized form.
          const rows = (j.results ?? []) as { title: string; date: string; url: string; body?: string; topic?: unknown }[];
          for (const r of rows)
            out.push({
              title: r.title,
              date: Number(r.date),
              url: r.url,
              fca: /false claims/i.test(r.title) || /qui tam/i.test(r.body ?? "") || /false claims act/i.test(JSON.stringify(r.topic ?? "")),
            });
          if (rows.length < 50) break;
        }
        return out;
      })(),
    });
  }
  return cache.get(key)!.p;
}

export const namesAny = (title: string, terms: string[]) =>
  terms.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title));

/** The earliest qualifying release for an item inside (from, to], unix seconds. */
export async function firstRelease(item: BasketItem, from: number, to: number): Promise<Release | null> {
  const terms = item.matchTerms.filter(validTerm);
  const hits: Release[] = [];
  for (const t of terms) for (const r of await releasesNaming(t)) if (r.fca && r.date > from && r.date <= to && namesAny(r.title, terms)) hits.push(r);
  return hits.sort((a, b) => a.date - b.date)[0] ?? null;
}

/** true: the cited entry is on that docket on that date. false: it is not. null: CourtListener unreachable. */
export async function docketEntryExists(item: BasketItem): Promise<boolean | null> {
  const q = new URLSearchParams({ type: "r", q: `docket_id:${item.docketId}`, entry_date_filed_after: item.entryDate, entry_date_filed_before: item.entryDate });
  const token = process.env.COURTLISTENER_TOKEN;
  try {
    const j = await getJson(`${CL}?${q}`, token ? { Authorization: `Token ${token}` } : {});
    return ((j.results ?? []) as { docket_id: number; recap_documents?: { entry_date_filed?: string }[] }[]).some(
      (r) => Number(r.docket_id) === Number(item.docketId) && (r.recap_documents ?? []).some((d) => d.entry_date_filed?.slice(0, 10) === item.entryDate),
    );
  } catch {
    return null;
  }
}

export type OnChain = { claimId: string; n: number; k: number; itemsRoot: string; committedAt: number; deadline: number; exclusivityEnd: number };

/** Evaluates a decrypted basket. Hit items are revealed (their releases are already public); misses stay sealed until
 *  the exclusivity window ends, so an early TRUE does not leak the pending cases a buyer paid for. */
export async function resolveBasket(pkg: EvidencePackage, c: OnChain, now = Math.floor(Date.now() / 1000)): Promise<BasketEvidence> {
  const b = commitBasket(pkg.items);
  const base = { claimId: c.claimId, resolver: pkg.claim.resolver, checkedAt: new Date(now * 1000).toISOString() };
  const fabricated = (note: string): BasketEvidence => ({ ...base, outcome: "FABRICATED", hitMask: "0", hits: 0, note, items: [] });
  if (pkg.items.length !== c.n || b.root.toLowerCase() !== c.itemsRoot.toLowerCase()) return fabricated("sealed basket does not match the committed itemsRoot");
  if (pkg.claim.k !== c.k) return fabricated("package k differs from the committed k");

  const replay = pkg.claim.resolver === "DOJ_FCA_REPLAY";
  const reveal = now >= c.exclusivityEnd;
  const items: BasketEvidence["items"] = [];
  let mask = 0n;
  for (const [i, it] of pkg.items.entries()) {
    const docketOk = await docketEntryExists(it);
    if (docketOk === false) return fabricated(`item ${i}: docket ${it.docketId} has no entry on ${it.entryDate} (${it.courtlistenerURL})`);
    if (docketOk === null) return { ...base, outcome: "UNRESOLVED", hitMask: "0", hits: 0, note: "CourtListener unreachable; retrying", items: [] };
    const asOf = Math.floor(new Date(`${it.entryDate}T00:00:00Z`).getTime() / 1000);
    const [from, to] = replay ? [asOf, asOf + (pkg.claim.windowDays ?? 60) * DAY] : [c.committedAt, Math.min(c.deadline, now)];
    const r = await firstRelease(it, from, to);
    if (r) mask |= 1n << BigInt(i);
    items.push({
      index: i,
      defendant: r || reveal ? it.defendant : "sealed",
      hit: !!r,
      ...(r ? { releaseURL: r.url, releaseTitle: r.title, releaseDate: new Date(r.date * 1000).toISOString().slice(0, 10) } : {}),
      docketOk: true,
      ...(r || reveal ? { item: it } : {}),
      leaf: b.leaves[i],
      proof: b.proof(i),
    });
  }
  const hits = items.filter((x) => x.hit).length;
  const outcome = hits >= c.k ? "TRUE" : now >= c.deadline ? "FALSE" : "UNRESOLVED";
  const note = `${hits} of ${c.n} items hit (claim: at least ${c.k})${outcome === "UNRESOLVED" ? "; waiting for the deadline" : ""}`;
  return { ...base, outcome, hitMask: mask.toString(), hits, note, items };
}
