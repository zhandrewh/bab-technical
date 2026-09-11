// Stores an already-encrypted envelope (the browser encrypts before upload; this server never sees plaintext).
import { storeEnvelope } from "@/lib/storage";
import { hashEnvelopeJson } from "@/lib/crypto";

export async function POST(req: Request) {
  const json = await req.text();
  try {
    const env = JSON.parse(json);
    if (env.v !== 1 || !env.ciphertext || !env.sealedKey) throw new Error();
  } catch {
    return Response.json({ error: "body must be a Verity envelope" }, { status: 400 });
  }
  if (json.length > 400_000) return Response.json({ error: "envelope too large (400KB max in v1)" }, { status: 413 });
  const uri = await storeEnvelope(json);
  return Response.json({ uri, payloadHash: hashEnvelopeJson(json), storage: uri.startsWith("ipfs://") ? "ipfs" : "calldata" });
}
