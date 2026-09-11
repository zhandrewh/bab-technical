// Adversarial seller for the slash demo. Commits a confident claim citing a Federal Register document that does
// not exist. The resolver adapter finds it in neither the FR nor public inspection -> FABRICATED -> 100% slash.
import { log, dim } from "./env";
import { commitClaim } from "./seller-fedreg";
import type { EvidencePackage } from "../lib/package";

export async function runFabricator(opts: { exclusivitySeconds?: bigint; deadlineHours?: number } = {}) {
  const fakeDoc = `2026-9${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const deadline = new Date(Date.now() + (opts.deadlineHours ?? 48) * 3600_000);
  const pkg: EvidencePackage = {
    version: 1,
    claim: {
      text: `Defense Department document ${fakeDoc} will be published in the Federal Register by ${deadline.toISOString().slice(0, 10)}, announcing suspension of a major logistics contractor.`,
      resolver: "FEDREG",
      query: { kind: "fedreg.published", documentNumber: fakeDoc },
      deadline: deadline.toISOString(),
    },
    entities: ["agency:defense-department", "cage:1abc2", `frdoc:${fakeDoc}`],
    sources: [{ title: `Public inspection filing ${fakeDoc}`, url: `https://www.federalregister.gov/public-inspection/${fakeDoc}`, retrievedAt: new Date().toISOString(), note: "does not exist" }],
    analysis: "Source says a suspension notice is imminent. (It is not. This package is fabricated for the slash demo.)",
    seller: { agent: "fabricator", version: "0.0.1" },
  };
  log("fabricator", `committing fabricated claim citing nonexistent FR doc ${fakeDoc}`);
  const pricing = { confidence: 9500, upfront: 300_000n, contingent: 1_200_000n, bond: 2_100_000n };
  dim(`claims 95% confidence, bond ${Number(pricing.bond) / 1e6} USDC — a confident liar`);
  return commitClaim(pkg, pricing, opts.exclusivitySeconds ?? 24n * 3600n, "fedreg:defense", "FABRICATOR");
}

if (require.main === module) runFabricator().catch((e) => (console.error(e), process.exit(1)));
