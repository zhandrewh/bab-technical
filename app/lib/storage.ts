// Encrypted envelope storage. Primary: IPFS via Pinata (PINATA_JWT). Fallback: the ciphertext rides in the commit
// calldata as a data: URI. Either way the on-chain payloadHash binds the exact bytes, and the seller is offline
// after commit — nothing in delivery depends on them.
import type { Envelope } from "./crypto";
import { utf8ToB64, b64ToUtf8 } from "./b64";

const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

export async function storeEnvelope(envelopeJson: string): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (jwt) {
    const form = new FormData();
    form.append("file", new Blob([envelopeJson], { type: "application/json" }), "verity-envelope.json");
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (res.ok) return `ipfs://${(await res.json()).IpfsHash}`;
    console.warn(`[storage] Pinata upload failed (${res.status}); falling back to calldata`);
  }
  return `data:application/json;base64,${utf8ToB64(envelopeJson)}`;
}

/** Returns the exact envelope bytes so callers can re-check keccak256 against the on-chain payloadHash. */
export async function fetchEnvelopeJson(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return b64ToUtf8(uri.split(",")[1]);
  if (uri.startsWith("ipfs://")) {
    const res = await fetch(IPFS_GATEWAY + uri.slice(7));
    if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
    return res.text();
  }
  throw new Error(`unsupported payload URI: ${uri.slice(0, 20)}`);
}

export const parseEnvelope = (json: string) => JSON.parse(json) as Envelope;
