// Oracle proposer service (spec 7). Trust model: a single bonded proposer. Anyone may dispute within the
// challenge window by posting a matching bond; disputed claims go to the owner backstop. Not "decentralized".
//
// Loop per open claim: fetch envelope -> verify payloadHash (mismatch = FABRICATED) -> obtain key via the same
// KeyReleaseProvider buyers use (oracle role) -> run the resolver adapter -> markPublished / propose -> settle.
import { log, dim, warn, wallet, send, ensureAllowance, publicClient, sleep } from "./env";
import { marketAbi } from "../lib/abi";
import { MARKET, OUTCOMES, STATUSES, usd } from "../lib/chain";
import { decryptPackage, hashEnvelopeJson } from "../lib/crypto";
import { fetchEnvelopeJson, parseEnvelope } from "../lib/storage";
import { CustodianKeyRelease, keyRequestMessage } from "../lib/keyRelease";
import { getCommitted } from "../lib/events";
import { resolve } from "../lib/resolvers";
import { pushReputation } from "./reputation";
import type { EvidencePackage } from "../lib/package";

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
    const readyAt = Number(c.proposedAt + window);
    const wait = readyAt - Math.floor(Date.now() / 1000);
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
  let outcome: keyof typeof OUTCOME_ID;
  let evidence: string;
  if (!hashOk || !pkg) {
    outcome = "FABRICATED";
    evidence = `payload hash mismatch at ${uri.slice(0, 60)}`;
  } else {
    const r = await resolve(pkg);
    dim(`#${claimId} ${pkg.claim.resolver}: ${r.outcome} — ${r.note}`);
    if (r.publicAt && c.publishedAt === 0n) {
      await send("oracle", `markPublished #${claimId}`, w.writeContract({ address: MARKET, abi: marketAbi, functionName: "markPublished", args: [claimId, r.evidenceURI] }));
    }
    if (r.outcome === "UNRESOLVED") return false;
    outcome = r.outcome;
    evidence = r.evidenceURI;
  }
  const bond = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "proposerBond" });
  await ensureAllowance("ORACLE", MARKET, bond);
  log("oracle", `proposing #${claimId} = ${outcome} (bonding ${usd(bond)})`);
  await send("oracle", `propose #${claimId} ${outcome}`, w.writeContract({ address: MARKET, abi: marketAbi, functionName: "propose", args: [claimId, OUTCOME_ID[outcome], evidence] }));
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
    const n = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "claimCount" });
    log("oracle", `watching ${n} claims`);
    for (;;) {
      for (let i = 0n; i < n; i++) await processClaim(i).catch((e) => warn("oracle", `#${i}: ${e.message.slice(0, 160)}`));
      await sleep(30_000);
    }
  })();
}
