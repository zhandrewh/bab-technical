// Key-release layer. The seller is NOT in this path: the AES key was sealed to the release layer at commit time,
// and release is a pure function of on-chain state:
//
//     VerityMarket.canDecrypt(claimId, who) == purchased[claimId][who] || block.timestamp >= exclusivityEnd
//
// Whitelisted oracles may also read, because resolving FABRICATED requires inspecting the evidence.
//
// v1 provider: CustodianKeyRelease — a stateless service holding one X25519 secret. TRUST ASSUMPTION: the custodian
// could release a key early or refuse to release. It cannot forge purchases or move exclusivity. The drop-in
// upgrade is LitKeyRelease: the same evmContractConditions (canDecrypt == true) evaluated by a threshold network,
// so no single party holds the key. See DESIGN.md.
import { verifyMessage, type Address, type Hex } from "viem";
import { marketAbi } from "./abi";
import { MARKET, publicClient, chain } from "./chain";
import { unsealKey } from "./crypto";
import { fetchEnvelopeJson, parseEnvelope } from "./storage";

export interface KeyReleaseProvider {
  readonly name: string;
  requestKey(claimId: bigint, requester: Address, proof: { signature: Hex; issuedAt: number }): Promise<KeyReleaseResult>;
}

export type KeyReleaseResult =
  | { ok: true; key: string; reason: "purchased" | "exclusivity-expired" | "oracle" }
  | { ok: false; status: number; error: string };

import { keyRequestMessage } from "./keyRelease.client";
export { keyRequestMessage };

export class CustodianKeyRelease implements KeyReleaseProvider {
  readonly name = "custodian-v1";
  constructor(private secret: string) {}

  async requestKey(claimId: bigint, requester: Address, proof: { signature: Hex; issuedAt: number }): Promise<KeyReleaseResult> {
    if (Math.abs(Date.now() / 1000 - proof.issuedAt) > 300) return { ok: false, status: 401, error: "signature expired" };
    const valid = await verifyMessage({ address: requester, message: keyRequestMessage(claimId, proof.issuedAt), signature: proof.signature });
    if (!valid) return { ok: false, status: 401, error: "bad signature" };

    const [canDecrypt, isOracle, claim] = await Promise.all([
      publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "canDecrypt", args: [claimId, requester] }),
      publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "oracles", args: [requester] }),
      publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [claimId] }),
    ]);
    if (!canDecrypt && !isOracle) return { ok: false, status: 403, error: "not purchased and exclusivity has not expired" };

    const uri = await payloadURIOf(claimId);
    const json = await fetchEnvelopeJson(uri);
    const key = unsealKey(parseEnvelope(json), this.secret);
    if (!key) return { ok: false, status: 500, error: "envelope not sealed to this custodian" };

    const purchased = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "purchased", args: [claimId, requester] });
    const expired = BigInt(Math.floor(Date.now() / 1000)) >= claim.exclusivityEnd;
    return { ok: true, key, reason: purchased ? "purchased" : expired ? "exclusivity-expired" : "oracle" };
  }
}

/** payloadURI lives only in the Committed event (not storage) to keep commits cheap. */
export async function payloadURIOf(claimId: bigint): Promise<string> {
  const { getCommitted } = await import("./events");
  const c = await getCommitted(claimId);
  if (!c) throw new Error(`claim ${claimId} not found`);
  return c.payloadURI;
}

export function defaultProvider(): KeyReleaseProvider {
  const secret = process.env.CUSTODIAN_SECRET;
  if (!secret) throw new Error("CUSTODIAN_SECRET not set");
  return new CustodianKeyRelease(secret);
}
