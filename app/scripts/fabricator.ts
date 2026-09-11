// Adversarial seller for the slash demo. Commits a very sharp basket ("4 of 6") whose docket citations do not exist.
// The oracle checks each cited entry on CourtListener, finds none -> FABRICATED -> 100% slash, buyers made whole first.
import { log, dim } from "./env";
import { commitClaim } from "./seller-fca";
import { basketEntities } from "../lib/fca";
import { randomSalt } from "../lib/merkle";
import type { BasketItem, EvidencePackage } from "../lib/package";

// Names a vendor-risk watchlist cares about, attached to docket ids that do not exist.
const LURES = ["Northrop Grumman", "Huntington Ingalls", "Leidos Holdings", "Humana Inc", "Centene Corporation", "Walgreens Boots"];

export async function runFabricator(opts: { exclusivitySeconds?: bigint; deadlineDays?: number } = {}) {
  const deadline = new Date(Date.now() + (opts.deadlineDays ?? 30) * 86_400_000);
  const entryDate = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const items: BasketItem[] = LURES.map((defendant, i) => {
    const docketId = 990_000_000 + Math.floor(Math.random() * 9_000_000) + i;
    return {
      defendant,
      matchTerms: [defendant.split(" ")[0]],
      court: "District Court, District of Columbia",
      docketId,
      docketNumber: `1:26-cv-0${4100 + i}`,
      entryDate,
      entryText: "NOTICE of Election to Intervene for Purposes of Settlement by UNITED STATES OF AMERICA (fabricated)",
      courtlistenerURL: `https://www.courtlistener.com/docket/${docketId}/`,
      salt: randomSalt(),
    };
  });
  const teaserBody = `sealed defense and health contractor cases will produce a DOJ settlement release by ${deadline.toISOString().slice(0, 10)}`;
  const pkg: EvidencePackage = {
    version: 2,
    claim: { teaser: `4 of ${items.length} ${teaserBody}`, teaserBody, n: items.length, k: 4, resolver: "DOJ_FCA", deadline: deadline.toISOString() },
    items,
    entities: basketEntities(items),
    sources: items.map((it) => ({ title: `${it.defendant} ${it.docketNumber}`, url: it.courtlistenerURL, retrievedAt: new Date().toISOString(), note: "does not exist" })),
    analysis: "Source says six settlements are imminent. (They are not. The cited docket entries are fabricated for the slash demo.)",
    seller: { agent: "fabricator", version: "0.0.2" },
  };
  log("fabricator", `committing "4 of 6" basket citing ${items.length} nonexistent docket entries`);
  const pricing = { confidence: 9500, upfront: 300_000n, contingent: 1_200_000n, bond: 2_100_000n };
  dim(`claims 95% confidence, bond ${Number(pricing.bond) / 1e6} USDC — a confident liar`);
  return commitClaim(pkg, pricing, opts.exclusivitySeconds ?? 24n * 3600n, "fca:defense", "FABRICATOR");
}

if (require.main === module) runFabricator().catch((e) => (console.error(e), process.exit(1)));
