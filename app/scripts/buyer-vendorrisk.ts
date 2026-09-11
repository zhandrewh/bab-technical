// Vendor-risk buyer agent. A compliance team's diligence bot with a contractor watchlist. No browser anywhere:
//   list baskets (HTTP) -> watchlist overlap, locally (Bloom) -> buy rule: random-basket odds < 5%, seller lift >= 3
//   (or bond >= 5x for a new seller), price within budget -> prove the key is sealed (403) -> buy over x402
//   (EIP-3009 USDC authorization, facilitator settles) -> request key -> decrypt -> verify hash and itemsRoot.
import { log, dim, warn, wallet, sleep } from "./env";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";
import { decryptPackage, hashEnvelopeJson } from "../lib/crypto";
import { fetchEnvelopeJson, parseEnvelope } from "../lib/storage";
import { keyRequestMessage } from "../lib/keyRelease";
import { overlapCount } from "../lib/bloom";
import { commitBasket } from "../lib/merkle";
import { fmtLift, fmtOdds } from "../lib/odds";
import { usd } from "../lib/chain";
import type { Hex } from "viem";
import type { EvidencePackage } from "../lib/package";

const API = process.env.VERITY_API || "http://localhost:3000";
const BUDGET = 5_000_000n; // $5 (testnet-scaled $5,000)

// The watchlist: vendors this team is exposed to. It never leaves this process.
export const WATCHLIST = [
  "lockheed", "raytheon", "northrop", "huntington", "leidos", "siemens", "honeywell", "boeing", "exactech", "nextgen",
  "diversicare", "humana", "centene", "walgreens", "slifco", "tareen", "meharry", "aetna", "illumina",
].map((d) => `defendant:${d}`);

async function requestKey(claimId: string) {
  const w = wallet("BUYER");
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await w.signMessage({ message: keyRequestMessage(BigInt(claimId), issuedAt) });
  return fetch(`${API}/api/key/${claimId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: w.account.address, signature, issuedAt }),
  });
}

type Listing = {
  id: string;
  teaser: string;
  n: number;
  k: number;
  randomOdds: number;
  expected: number;
  sellerLift: number | null;
  bondMultiple: number;
  bloomFilter: string;
  currentUpfront: string;
  contingent: string;
  payloadURI: string;
  payloadHash: string;
  itemsRoot: string;
};

export async function runBuyer(claimId: string) {
  const w = wallet("BUYER");
  log("vendor-risk", `agent ${w.account.address} browsing ${API}/api/x402/claims`);
  // A just-committed basket can take a block or two to reach the API's RPC node.
  let c: Listing | undefined;
  for (let i = 0; i < 30 && !c; i++) {
    const { claims } = await (await fetch(`${API}/api/x402/claims?status=OPEN`)).json();
    c = claims.find((x: { id: string }) => x.id === claimId);
    if (!c) await sleep(2000);
  }
  if (!c) throw new Error(`basket ${claimId} not listed after 60s`);

  const hits = overlapCount(c.bloomFilter as Hex, WATCHLIST);
  const price = BigInt(c.currentUpfront) + BigInt(c.contingent);
  log("vendor-risk", `#${claimId} "${c.teaser}"`);
  dim(`watchlist overlap ${hits} of ${WATCHLIST.length} (computed locally; watchlist not disclosed) · expected by chance ${c.expected.toFixed(1)} · random-basket odds ${fmtOdds(c.randomOdds)}`);
  dim(`seller lift ${fmtLift(c.sellerLift)} · bond ${c.bondMultiple}× upfront · ask ${usd(price)}`);

  const reasons: string[] = [];
  if (hits === 0) reasons.push("no overlap with our watchlist");
  if (c.randomOdds >= 0.05) reasons.push(`a random basket would do this ${fmtOdds(c.randomOdds)} of the time`);
  if (c.sellerLift != null ? c.sellerLift < 3 : c.bondMultiple < 5) reasons.push(c.sellerLift != null ? `seller lift ${fmtLift(c.sellerLift)} < 3×` : `new seller with bond ${c.bondMultiple}× < 5×`);
  if (price > BUDGET) reasons.push(`ask ${usd(price)} over budget`);
  if (reasons.length) {
    warn("vendor-risk", `passing: ${reasons.join("; ")}`);
    return null;
  }
  log("vendor-risk", "buy rule met: sharp claim, bonded seller, touches our vendors");

  const before = await requestKey(claimId);
  const beforeBody = await before.json();
  let k: { key?: string; reason?: string; provider?: string; error?: string } = {};
  if (before.ok) {
    log("vendor-risk", `already entitled to #${claimId} (${beforeBody.reason}) — not paying twice`);
    k = beforeBody;
  } else {
    log("vendor-risk", `key request before paying -> HTTP ${before.status} (${beforeBody.error})`);
    const pay = wrapFetchWithPayment(fetch, w as never, BUDGET);
    log("vendor-risk", `buying #${claimId} over x402 — ${usd(BigInt(c.currentUpfront))} upfront + ${usd(BigInt(c.contingent))} contingent, both escrowed`);
    const res = await pay(`${API}/api/x402/claims/${claimId}/buy`);
    const body = await res.json();
    if (!res.ok) throw new Error(`x402 purchase failed: ${res.status} ${JSON.stringify(body)}`);
    const receipt = res.headers.get("x-payment-response");
    if (receipt) dim(`x402 settlement: ${JSON.stringify(decodeXPaymentResponse(receipt))}`);
    log("vendor-risk", `purchased ✓ payment ${body.paymentTx}`);
    log("vendor-risk", `escrow    ✓ ${body.purchaseTx}`);
    // The custodian reads purchased[] from a load-balanced RPC; give lagging nodes a moment to see the purchase.
    let after: Response | null = null;
    for (let i = 0; i < 20; i++) {
      after = await requestKey(claimId);
      k = await after.json();
      if (after.ok || after.status !== 403) break;
      dim("key layer's rpc hasn't seen the purchase yet — retrying");
      await sleep(2000);
    }
    if (!after?.ok) throw new Error(`key release failed: ${JSON.stringify(k)}`);
  }
  if (!k.key) throw new Error("no key returned");
  log("vendor-risk", `key released by ${k.provider} (reason: ${k.reason}) — seller not contacted`);

  const envJson = await fetchEnvelopeJson(c.payloadURI);
  const hashOk = hashEnvelopeJson(envJson) === c.payloadHash;
  const pkg = JSON.parse(await decryptPackage(parseEnvelope(envJson), k.key)) as EvidencePackage;
  const rootOk = commitBasket(pkg.items).root.toLowerCase() === String(c.itemsRoot).toLowerCase();
  log("vendor-risk", `decrypted basket · payload hash ${hashOk ? "matches" : "MISMATCH"} · items ${rootOk ? "verify against itemsRoot" : "DO NOT MATCH itemsRoot — fabrication signal"}`);
  for (const it of pkg.items) dim(`${it.defendant} · ${it.docketNumber} · ${it.entryDate} · ${it.courtlistenerURL}`);
  return pkg;
}

if (require.main === module) runBuyer(process.argv[2] ?? "0").catch((e) => (console.error(e), process.exit(1)));
