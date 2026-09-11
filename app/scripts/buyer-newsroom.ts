// Newsroom buyer agent. No browser anywhere in this path:
//   list claims (HTTP) -> relevance preview against its beat, locally (Bloom) -> prove the key is sealed (403)
//   -> buy over x402 (EIP-3009 USDC authorization, facilitator settles) -> request key -> decrypt -> verify hash.
import { log, dim, warn, wallet, sleep } from "./env";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";
import { decryptPackage, hashEnvelopeJson } from "../lib/crypto";
import { fetchEnvelopeJson, parseEnvelope } from "../lib/storage";
import { keyRequestMessage } from "../lib/keyRelease";
import { overlapCount } from "../lib/bloom";
import { usd } from "../lib/chain";
import type { Hex } from "viem";

const API = process.env.VERITY_API || "http://localhost:3000";

// The newsroom's beat. It never leaves this process.
export const BEAT = [
  "agency:defense-department",
  "agency:health-and-human-services-department",
  "agency:national-institutes-of-health",
  "agency:nuclear-regulatory-commission",
  "agency:securities-and-exchange-commission",
  "agency:environmental-protection-agency",
  "agency:national-oceanic-and-atmospheric-administration",
  "agency:federal-aviation-administration",
  "agency:transportation-department",
  "agency:food-and-drug-administration",
  "cage:1abc2",
];

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

export async function runBuyer(claimId: string) {
  const w = wallet("BUYER");
  log("newsroom", `agent ${w.account.address} browsing ${API}/api/x402/claims`);
  // A just-committed claim can take a block or two to reach the API's RPC node.
  let c: Record<string, any> | undefined;
  for (let i = 0; i < 30 && !c; i++) {
    const { claims } = await (await fetch(`${API}/api/x402/claims?status=OPEN`)).json();
    c = claims.find((x: { id: string }) => x.id === claimId);
    if (!c) await sleep(2000);
  }
  if (!c) throw new Error(`claim ${claimId} not listed after 60s`);

  const hits = overlapCount(c.bloomFilter as Hex, BEAT);
  log("newsroom", `relevance preview for #${claimId}: touches ${hits} of ${BEAT.length} entities on our beat (computed locally; beat not disclosed)`);
  dim(`resolver ${c.resolver} · bond ${c.bondMultiple}x upfront · seller confidence ${(c.confidence * 100).toFixed(0)}% · novelty ${c.novelty}`);
  if (hits === 0) {
    warn("newsroom", "no overlap with our beat — passing");
    return null;
  }

  const before = await requestKey(claimId);
  const beforeBody = await before.json();
  let after: Response | null = null;
  let k: { key?: string; reason?: string; provider?: string; error?: string } = {};
  if (before.ok) {
    log("newsroom", `already entitled to #${claimId} (${beforeBody.reason}) — not paying twice`);
    k = beforeBody;
  } else {
    log("newsroom", `key request before paying -> HTTP ${before.status} (${beforeBody.error})`);
    const pay = wrapFetchWithPayment(fetch, w as never, 5_000_000n);
    log("newsroom", `buying #${claimId} over x402 — ask ${usd(BigInt(c.currentUpfront))} upfront + ${usd(BigInt(c.contingent))} contingent, both escrowed`);
    const res = await pay(`${API}/api/x402/claims/${claimId}/buy`);
    const body = await res.json();
    if (!res.ok) throw new Error(`x402 purchase failed: ${res.status} ${JSON.stringify(body)}`);
    const receipt = res.headers.get("x-payment-response");
    if (receipt) dim(`x402 settlement: ${JSON.stringify(decodeXPaymentResponse(receipt))}`);
    log("newsroom", `purchased ✓ payment ${body.paymentTx}`);
    log("newsroom", `escrow    ✓ ${body.purchaseTx}`);
    // The custodian reads purchased[] from a load-balanced RPC; give lagging nodes a moment to see the purchase.
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
  log("newsroom", `key released by ${k.provider} (reason: ${k.reason}) — seller not contacted`);

  const envJson = await fetchEnvelopeJson(c.payloadURI);
  const hashOk = hashEnvelopeJson(envJson) === c.payloadHash;
  const pkg = JSON.parse(await decryptPackage(parseEnvelope(envJson), k.key));
  log("newsroom", `decrypted package · payload hash matches commit: ${hashOk ? "yes" : "NO — FABRICATION SIGNAL"}`);
  dim(`claim: ${pkg.claim.text}`);
  for (const s of pkg.sources) dim(`source: ${s.title} ${s.url}`);
  return pkg;
}

if (require.main === module) runBuyer(process.argv[2] ?? "0").catch((e) => (console.error(e), process.exit(1)));
