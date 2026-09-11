// One command, from cold: `npm run demo`
//   Act 1 — THE SLASH. A confident fabricator commits "4 of 6" citing docket entries that do not exist. The vendor-risk
//           agent buys it over x402. The oracle finds the citations missing on CourtListener; the bond burns on chain.
//   Act 2 — SETTLEMENT ON HISTORY. A backtest basket (DOJ_FCA_REPLAY) of real settlement-intervention notices. The
//           buyer checks the odds and its watchlist, buys over x402, decrypts, verifies the root. The oracle checks
//           each item against justice.gov and proposes TRUE with a hitMask; contingent + bond settle. No seller record.
//   Act 3 — LIVE. A basket from the last 45 days of notices is committed and left open to resolve against DOJ over
//           the coming weeks. Its 60-second exclusivity then opens the key to a stranger with no action by anyone.
import { log, dim, warn, sleep, wallet, publicClient } from "./env";
import { marketAbi } from "../lib/abi";
import { runFabricator } from "./fabricator";
import { runSeller } from "./seller-fca";
import { runBuyer } from "./buyer-vendorrisk";
import { runOracleUntilSettled } from "./oracle";
import { keyRequestMessage } from "../lib/keyRelease";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { EXPLORER, MARKET } from "../lib/chain";

const API = process.env.VERITY_API || "http://localhost:3000";
const banner = (s: string) => console.log(`\n\x1b[38;2;254;203;51m━━━ ${s} ${"━".repeat(Math.max(0, 70 - s.length))}\x1b[0m`);

async function openBy(role: "FABRICATOR" | "SELLER", resolverIsReplay?: boolean): Promise<bigint | null> {
  const who = wallet(role).account.address.toLowerCase();
  const n = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "claimCount" });
  let found: bigint | null = null;
  for (let i = 0n; i < n; i++) {
    const c = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [i] });
    const replay = (await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "replayResolver", args: [c.resolverId] })) as boolean;
    if (c.seller.toLowerCase() === who && c.status !== 3 && (resolverIsReplay === undefined || replay === resolverIsReplay)) found = i;
  }
  return found;
}

(async () => {
  banner("VERITY · sealed k-of-N FCA baskets · Base Sepolia");
  dim(`market ${EXPLORER}/address/${MARKET}`);
  dim(`live feed ${API}`);
  const ex = BigInt(process.env.DEMO_EXCLUSIVITY_SECONDS ?? 3600);

  banner("ACT 1 · THE SLASH");
  // Resume: reuse an open fabricated basket from an interrupted run rather than bonding a new one.
  let fake = await openBy("FABRICATOR");
  if (fake !== null) log("demo", `resuming with open fabricated basket #${fake}`);
  else fake = await runFabricator({ exclusivitySeconds: ex });
  await runBuyer(fake.toString());
  log("demo", "oracle resolving…");
  await runOracleUntilSettled([fake], 8_000);
  log("demo", `basket #${fake} FABRICATED — bond slashed, buyer made whole. ${API}/claim/${fake}`);

  banner("ACT 2 · SETTLEMENT ON HISTORY (backtest replay)");
  let replay = await openBy("SELLER", true);
  if (replay !== null) log("demo", `resuming with open replay basket #${replay}`);
  else replay = await runSeller({ replay: true, exclusivitySeconds: ex });
  await runBuyer(replay.toString());
  log("demo", "oracle checking each item against justice.gov…");
  await runOracleUntilSettled([replay], 8_000);
  log("demo", `basket #${replay} settled — see the revealed basket at ${API}/claim/${replay}`);

  banner("ACT 3 · LIVE BASKET (left open) + AUTO-RELEASE");
  const live = await runSeller({ exclusivitySeconds: 60n }).catch((e) => {
    warn("demo", `live basket skipped: ${(e as Error).message}`);
    return null;
  });
  if (live !== null) {
    await runBuyer(live.toString()).catch((e) => warn("demo", `buyer: ${(e as Error).message}`));
    const stranger = privateKeyToAccount(generatePrivateKey());
    const ask = async () => {
      // 404 = the key layer's rpc hasn't seen the brand-new claim yet; retry until it gives a real answer.
      for (let i = 0; ; i++) {
        const issuedAt = Math.floor(Date.now() / 1000);
        const signature = await stranger.signMessage({ message: keyRequestMessage(live, issuedAt) });
        const r = await fetch(`${API}/api/key/${live}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: stranger.address, signature, issuedAt }) });
        if (r.status !== 404 || i >= 15) return r;
        await sleep(2000);
      }
    };
    log("demo", `stranger ${stranger.address.slice(0, 10)}… asks for the key now -> HTTP ${(await ask()).status}`);
    dim("waiting 65s for exclusivity to expire (fixed at commit; neither party can move it)…");
    await sleep(65_000);
    const r = await ask();
    log("demo", `stranger asks again -> HTTP ${r.status} ${r.ok ? `(${(await r.json()).reason})` : ""}`);
    log("demo", `basket #${live} stays open; the oracle resolves it against justice.gov by its deadline. ${API}/claim/${live}`);
  }

  banner("DONE");
  dim(`buyer ${wallet("BUYER").account.address}`);
  dim(`every transaction above is on ${EXPLORER}; the feed at ${API} is built from the same event log.`);
})().catch((e) => {
  warn("demo", (e as Error).stack ?? String(e));
  process.exit(1);
});
