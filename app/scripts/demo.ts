// One command, from cold: `npm run demo`
//   Act 1 — THE SLASH. A confident fabricator commits a claim citing a document that does not exist. A newsroom
//           agent buys it over x402. The oracle proves the citation is fake; the bond burns on chain.
//   Act 2 — THE HAPPY PATH. The Federal Register monitor commits a real claim from live data. The newsroom agent
//           runs the overlap check, buys over x402, decrypts. The oracle resolves TRUE; contingent + bond settle.
//   Act 3 — AUTO-RELEASE. A claim with a 60-second exclusivity window opens to a stranger with no action by anyone.
import { log, dim, warn, sleep, wallet, publicClient } from "./env";
import { marketAbi } from "../lib/abi";
import { runFabricator } from "./fabricator";
import { runSeller } from "./seller-fedreg";
import { runBuyer, BEAT } from "./buyer-newsroom";
import { runOracleUntilSettled } from "./oracle";
import { keyRequestMessage } from "../lib/keyRelease";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { EXPLORER, MARKET } from "../lib/chain";

const API = process.env.VERITY_API || "http://localhost:3000";
const banner = (s: string) => console.log(`\n\x1b[38;2;254;203;51m━━━ ${s} ${"━".repeat(Math.max(0, 70 - s.length))}\x1b[0m`);

(async () => {
  banner("VERITY · sealed accountability findings · Base Sepolia");
  dim(`market ${EXPLORER}/address/${MARKET}`);
  dim(`live feed ${API}`);
  const ex = BigInt(process.env.DEMO_EXCLUSIVITY_SECONDS ?? 3600);

  banner("ACT 1 · THE SLASH");
  // Resume: reuse an open fabricated claim from an interrupted run rather than bonding a new one.
  const fab = wallet("FABRICATOR").account.address.toLowerCase();
  const n = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "claimCount" });
  let fake: bigint | null = null;
  for (let i = 0n; i < n; i++) {
    const c = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [i] });
    if (c.seller.toLowerCase() === fab && c.status !== 3) fake = i;
  }
  if (fake !== null) log("demo", `resuming with open fabricated claim #${fake}`);
  else fake = await runFabricator({ exclusivitySeconds: ex, deadlineHours: 48 });
  await runBuyer(fake.toString());
  log("demo", "oracle resolving…");
  await runOracleUntilSettled([fake], 8_000);
  log("demo", `claim #${fake} FABRICATED — bond slashed, buyer made whole. ${API}/claim/${fake}`);

  banner("ACT 2 · THE HAPPY PATH (live Federal Register data)");
  // The seller steers toward demand it can see (the newsroom's public standing interest), so the buyer has overlap.
  const [real] = await runSeller({ backfill: true, max: 1, exclusivitySeconds: ex, deadlineHours: 48, preferAgencies: BEAT });
  await runBuyer(real.toString());
  log("demo", "oracle resolving…");
  await runOracleUntilSettled([real], 8_000);
  log("demo", `claim #${real} TRUE — contingent + bond to seller. ${API}/claim/${real}`);

  banner("ACT 3 · AUTO-RELEASE (60s exclusivity, no one acts)");
  const [open] = await runSeller({ backfill: true, max: 1, exclusivitySeconds: 60n, deadlineHours: 48 });
  const stranger = privateKeyToAccount(generatePrivateKey());
  const ask = async () => {
    // 404 = the key layer's rpc hasn't seen the brand-new claim yet; retry until it gives a real answer.
    for (let i = 0; ; i++) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await stranger.signMessage({ message: keyRequestMessage(open, issuedAt) });
      const r = await fetch(`${API}/api/key/${open}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: stranger.address, signature, issuedAt }) });
      if (r.status !== 404 || i >= 15) return r;
      await sleep(2000);
    }
  };
  log("demo", `stranger ${stranger.address.slice(0, 10)}… asks for the key now -> HTTP ${(await ask()).status}`);
  dim("waiting 65s for exclusivity to expire (fixed at commit; neither party can move it)…");
  await sleep(65_000);
  const r = await ask();
  log("demo", `stranger asks again -> HTTP ${r.status} ${r.ok ? `(${(await r.json()).reason})` : ""}`);

  banner("DONE");
  dim(`buyer ${wallet("BUYER").account.address}`);
  dim(`every transaction above is on ${EXPLORER}; the feed at ${API} is built from the same event log.`);
})().catch((e) => {
  warn("demo", (e as Error).stack ?? String(e));
  process.exit(1);
});
