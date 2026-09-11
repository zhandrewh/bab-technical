// The call demo, under 5 minutes: `npm run demo:live` (add `-- --check` to run only the preflight).
//   1. The seller agent commits a 3-of-10 replay basket (real historical FCA notices) with a 30-second exclusivity window.
//   2. The claim page opens. You buy it in the browser, decrypt it, and verify every item against itemsRoot.
//   3. The window closes. A stranger who paid nothing gets 403 before and 200 after, and nobody had to act.
//   4. The oracle checks each item on CourtListener and justice.gov, proposes TRUE with a hitMask, and settles after the
//      challenge window.
// Env: VERITY_API (defaults to the live app) · DEMO_WALLET (your browser wallet, for its preflight) · DEMO_EXCLUSIVITY_SECONDS.
import { spawn } from "node:child_process";
import { formatEther, type Address } from "viem";
import { log, dim, warn, sleep, wallet, send, publicClient, waitUntil } from "./env";
import { marketAbi, erc20Abi } from "../lib/abi";
import { EXPLORER, MARKET, USDC, STATUSES, OUTCOMES, usd } from "../lib/chain";
import { keyRequestMessage } from "../lib/keyRelease";
import { runSeller } from "./seller-fca";
import { runOracleUntilSettled } from "./oracle";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const API = process.env.VERITY_API || "https://verity-andrew-2d2a.vercel.app";
const EXCL = BigInt(process.env.DEMO_EXCLUSIVITY_SECONDS ?? 30);
const DEMO_WALLET = process.env.DEMO_WALLET as Address | undefined;
const args = process.argv.slice(2);
const banner = (s: string) => console.log(`\n\x1b[38;2;254;203;51m━━━ ${s} ${"━".repeat(Math.max(0, 70 - s.length))}\x1b[0m`);
const usdcOf = (a: Address) => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [a] });

async function preflight(): Promise<boolean> {
  banner("PREFLIGHT");
  let ok = true;
  const need = async (role: "SELLER" | "ORACLE", usdcMin: bigint) => {
    const a = wallet(role).account.address;
    const [eth, u] = await Promise.all([publicClient.getBalance({ address: a }), usdcOf(a)]);
    const good = eth > 2_000_000_000_000n && u >= usdcMin;
    (good ? log : warn)(role.toLowerCase(), `${a} · ${formatEther(eth)} ETH · ${usd(u)} (needs ${usd(usdcMin)})`);
    ok &&= good;
  };
  const bond = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "proposerBond" });
  await need("SELLER", 1_250_000n); // replay bond (7x upfront, floor $1)
  await need("ORACLE", bond);
  if (!DEMO_WALLET) {
    warn("buyer", "DEMO_WALLET not set: can't check your browser wallet. Set it to see balance and allowance.");
  } else {
    let u = await usdcOf(DEMO_WALLET);
    const eth = await publicClient.getBalance({ address: DEMO_WALLET });
    if (args.includes("--fund") && u < 5_000_000n) {
      await send("fund", `5 USDC -> ${DEMO_WALLET}`, wallet("DEPLOYER").writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [DEMO_WALLET, 5_000_000n] }));
      u = await usdcOf(DEMO_WALLET);
    }
    if (args.includes("--fund") && eth < 5_000_000_000_000n) {
      await send("fund", `0.00002 ETH -> ${DEMO_WALLET}`, wallet("DEPLOYER").sendTransaction({ to: DEMO_WALLET, value: 20_000_000_000_000n }));
    }
    const allowance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [DEMO_WALLET, MARKET] });
    const good = u >= 1_900_000n;
    (good ? log : warn)("buyer", `${DEMO_WALLET} · ${usd(u)} (needs ~$1.82)${good ? "" : " — run with --fund"}`);
    if (allowance < 1_900_000n) warn("buyer", `allowance ${usd(allowance)}: your first purchase adds an approve step. Buy any basket once before the call.`);
    else log("buyer", `allowance ${usd(allowance)} ✓ purchase is one click`);
    ok &&= good;
  }
  const t = Date.now();
  const r = await fetch(`${API}/api/x402/claims?status=OPEN`).catch(() => null);
  (r?.ok ? log : warn)("api", `${API} -> ${r?.status ?? "unreachable"} in ${Date.now() - t}ms`);
  return ok && !!r?.ok;
}

async function stranger(id: bigint) {
  const who = privateKeyToAccount(generatePrivateKey());
  return async () => {
    for (let i = 0; ; i++) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await who.signMessage({ message: keyRequestMessage(id, issuedAt) });
      const r = await fetch(`${API}/api/key/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: who.address, signature, issuedAt }) });
      // 404 = the key layer's rpc hasn't seen the brand-new claim yet.
      if (r.status !== 404 || i >= 15) return { status: r.status, body: await r.json().catch(() => ({})), who: who.address };
      await sleep(1500);
    }
  };
}

(async () => {
  if (!(await preflight())) {
    warn("demo", "preflight failed — fix the lines in red first");
    process.exit(1);
  }
  if (args.includes("--check")) return;

  banner(`COMMIT · replay basket, ${EXCL}s exclusivity`);
  const id = await runSeller({ replay: true, exclusivitySeconds: EXCL });
  const url = `${API}/claim/${id}`;
  // Open only once the app's rpc can see the claim, or the page 404s.
  for (let i = 0; i < 20; i++) {
    const { claims } = await (await fetch(`${API}/api/x402/claims?status=OPEN`)).json();
    if (claims.some((x: { id: string }) => x.id === id.toString())) break;
    await sleep(1000);
  }
  log("demo", `basket #${id} live → ${url}`);
  if (!args.includes("--no-open") && process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();

  banner("BUY · in the browser, before the window closes");
  const ask = await stranger(id);
  const before = await ask();
  log("stranger", `${before.who.slice(0, 10)}… (paid nothing) asks for the key -> HTTP ${before.status} ${before.body.error ?? ""}`);
  const c0 = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [id] });
  const end = Number(c0.exclusivityEnd);
  const seen = new Set<string>();
  for (;;) {
    const left = end - Math.floor(Date.now() / 1000);
    const buyers = (await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "buyersOf", args: [id] })) as Address[];
    for (const b of buyers) {
      if (seen.has(b)) continue;
      seen.add(b);
      log("escrow", `purchase by ${b} ✓ both tranches in escrow`);
    }
    if (left <= 0) break;
    dim(`window closes in ${left}s`);
    await sleep(Math.min(5000, left * 1000 + 500));
  }
  if (!seen.size) warn("demo", "nobody bought — settlement still runs, the contingent just has no buyer to refund");

  banner("EXPIRED · the key opens to everyone");
  const after = await ask();
  log("stranger", `same stranger asks again -> HTTP ${after.status} ${after.body.reason ? `(${after.body.reason})` : ""}`);
  dim("exclusivityEnd was fixed at commit; neither the seller nor the buyer could move it.");

  banner("RESOLVE · oracle vs CourtListener + justice.gov");
  const window = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "challengeWindow" });
  dim(`after propose, anyone can dispute for ${window}s — then it settles`);
  await runOracleUntilSettled([id], 5_000);

  // The settle tx is confirmed; wait for the load-balanced rpc to agree before reading the final state.
  await waitUntil("settled state visible to rpc", async () =>
    STATUSES[(await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [id] })).status] === "SETTLED",
  ).catch(() => {});
  const c = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [id] });
  banner(`SETTLED · ${OUTCOMES[c.proposed]}`);
  log("demo", `basket #${id} ${STATUSES[c.status]} → ${url}`);
  dim(`every transaction is on ${EXPLORER}/address/${MARKET}`);
})().catch((e) => {
  warn("demo", (e as Error).stack ?? String(e));
  process.exit(1);
});
