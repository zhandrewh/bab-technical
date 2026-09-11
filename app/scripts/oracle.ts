// Oracle proposer service (spec 2). Trust model: a single bonded proposer. Anyone may dispute within the challenge
// window by posting a matching bond; disputed claims go to the owner backstop. Not "decentralized".
//
// Loop per open basket: fetch envelope -> verify payloadHash (mismatch = FABRICATED) -> obtain key via the same
// KeyReleaseProvider buyers use (oracle role) -> verify every item against itemsRoot and its cited docket entry
// -> evaluate each item against justice.gov -> propose(outcome, hitMask, evidence JSON) -> settle after the window.
import { log, dim, warn, wallet, send, ensureAllowance, publicClient, sleep } from "./env";
import { marketAbi } from "../lib/abi";
import { MARKET, OUTCOMES, STATUSES, usd } from "../lib/chain";
import { decryptPackage, hashEnvelopeJson } from "../lib/crypto";
import { fetchEnvelopeJson, parseEnvelope, storeEnvelope } from "../lib/storage";
import { CustodianKeyRelease, keyRequestMessage } from "../lib/keyRelease";
import { getCommitted } from "../lib/events";
import { resolveBasket } from "../lib/fca";
import { pushReputation } from "./reputation";
import type { BasketEvidence, EvidencePackage } from "../lib/package";

const OUTCOME_ID = { TRUE: 1, FALSE: 2, FABRICATED: 3 } as const;

async function readPackage(claimId: bigint): Promise<{ pkg: EvidencePackage | null; hashOk: boolean; uri: string }> {
  const c = await getCommitted(claimId);
  if (!c) throw new Error(`no Committed event for ${claimId}`);
  const json = await fetchEnvelopeJson(c.payloadURI);
  const hashOk = hashEnvelopeJson(json) === c.payloadHash;
  if (!hashOk) return { pkg: null, hashOk, uri: c.payloadURI };
  const w = wallet("ORACLE");
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await w.signMessage({ message: keyRequestMessage(claimId, issuedAt) });
  const r = await new CustodianKeyRelease(process.env.CUSTODIAN_SECRET!).requestKey(claimId, w.account.address, { signature, issuedAt });
  if (!r.ok) throw new Error(`key release refused oracle: ${r.error}`);
  const pkg = JSON.parse(await decryptPackage(parseEnvelope(json), r.key)) as EvidencePackage;
  return { pkg, hashOk, uri: c.payloadURI };
}

/** One pass over a claim. Returns true once the claim is settled. */
export async function processClaim(claimId: bigint): Promise<boolean> {
  const w = wallet("ORACLE");
  const c = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [claimId] });
  const status = STATUSES[c.status];
  if (status === "SETTLED") return true;
  if (status === "DISPUTED") {
    dim(`#${claimId} disputed — awaiting owner backstop`);
    return false;
  }
  if (status === "PROPOSED") {
    const window = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "challengeWindow" });
    const wait = Number(c.proposedAt + window) - Math.floor(Date.now() / 1000);
    if (wait > 0) {
      dim(`#${claimId} proposed ${OUTCOMES[c.proposed]}; challenge window closes in ${wait}s`);
      return false;
    }
    await send("oracle", `settle #${claimId} (${OUTCOMES[c.proposed]})`, w.writeContract({ address: MARKET, abi: marketAbi, functionName: "settle", args: [claimId] }));
    await pushReputation(claimId).catch((e) => warn("oracle", `ERC-8004 feedback skipped: ${e.message?.slice(0, 120)}`));
    return true;
  }

  // OPEN
  const { pkg, hashOk, uri } = await readPackage(claimId);
  let ev: BasketEvidence;
  if (!hashOk || !pkg) {
    ev = { claimId: claimId.toString(), resolver: "DOJ_FCA", checkedAt: new Date().toISOString(), outcome: "FABRICATED", hitMask: "0", hits: 0, note: `payload hash mismatch at ${uri.slice(0, 60)}`, items: [] };
  } else {
    const onchain = {
      claimId: claimId.toString(),
      n: c.n,
      k: c.k,
      itemsRoot: c.itemsRoot,
      committedAt: Number(c.committedAt),
      deadline: Number(c.deadline),
      exclusivityEnd: Number(c.exclusivityEnd),
    };
    ev = await resolveBasket(pkg, onchain);
  }
  dim(`#${claimId} ${ev.resolver}: ${ev.outcome} — ${ev.note}`);
  if (ev.outcome === "UNRESOLVED") return false;

  const evidenceURI = await storeEnvelope(JSON.stringify(ev));
  // A hit is a DOJ press release: by construction the finding is on the public record.
  if (ev.outcome === "TRUE" && c.publishedAt === 0n) {
    const firstHit = ev.items.find((x) => x.hit)?.releaseURL ?? evidenceURI;
    await send("oracle", `markPublished #${claimId}`, w.writeContract({ address: MARKET, abi: marketAbi, functionName: "markPublished", args: [claimId, firstHit] }));
  }
  const bond = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "proposerBond" });
  await ensureAllowance("ORACLE", MARKET, bond);
  log("oracle", `proposing #${claimId} = ${ev.outcome} · ${ev.hits} of ${c.n} hit (bonding ${usd(bond)})`);
  await send(
    "oracle",
    `propose #${claimId} ${ev.outcome}`,
    w.writeContract({ address: MARKET, abi: marketAbi, functionName: "propose", args: [claimId, OUTCOME_ID[ev.outcome], BigInt(ev.hitMask), evidenceURI] }),
  );
  return false;
}

export async function runOracleUntilSettled(ids: bigint[], pollMs = 10_000) {
  const pending = new Set(ids.map(String));
  while (pending.size) {
    for (const id of [...pending]) {
      try {
        if (await processClaim(BigInt(id))) pending.delete(id);
      } catch (e) {
        warn("oracle", `#${id}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    if (pending.size) await sleep(pollMs);
  }
}

if (require.main === module) {
  (async () => {
    for (;;) {
      const n = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "claimCount" });
      log("oracle", `watching ${n} baskets`);
      for (let i = 0n; i < n; i++) await processClaim(i).catch((e) => warn("oracle", `#${i}: ${e.message.slice(0, 160)}`));
      await sleep(60_000);
    }
  })();
}
