// Evidence package crypto. Runs in Node (agents, custodian) and the browser (commit flow, buyer decrypt).
//
// payload  --AES-256-GCM(K)-->  ciphertext
// K        --nacl.box(ephemeral, custodianPub)-->  sealedKey      (only the key-release layer can unwrap K)
// envelope = { ciphertext, iv, sealedKey, ephPub, nonce }          payloadHash = keccak256(envelope JSON)
import nacl from "tweetnacl";
import { keccak256, toBytes, toHex } from "viem";

export type Envelope = {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  ciphertext: string;
  keyWrap: "x25519-xsalsa20-poly1305";
  ephPub: string;
  nonce: string;
  sealedKey: string;
};

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const subtle = globalThis.crypto.subtle;

export async function encryptPackage(plaintext: string, custodianPubB64: string) {
  const key = nacl.randomBytes(32);
  const iv = nacl.randomBytes(12);
  const k = await subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(plaintext)));
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const sealed = nacl.box(key, nonce, unb64(custodianPubB64), eph.secretKey);
  const envelope: Envelope = {
    v: 1,
    alg: "AES-256-GCM",
    iv: b64(iv),
    ciphertext: b64(ct),
    keyWrap: "x25519-xsalsa20-poly1305",
    ephPub: b64(eph.publicKey),
    nonce: b64(nonce),
    sealedKey: b64(sealed),
  };
  const envelopeJson = JSON.stringify(envelope);
  return { envelope, envelopeJson, payloadHash: keccak256(toBytes(envelopeJson)), key: b64(key) };
}

/** Custodian side: unwrap K. Returns null if the envelope was not sealed to this custodian. */
export function unsealKey(envelope: Envelope, custodianSecretB64: string): string | null {
  const key = nacl.box.open(unb64(envelope.sealedKey), unb64(envelope.nonce), unb64(envelope.ephPub), unb64(custodianSecretB64));
  return key ? b64(key) : null;
}

export async function decryptPackage(envelope: Envelope, keyB64: string): Promise<string> {
  const k = await subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["decrypt"]);
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: unb64(envelope.iv) }, k, unb64(envelope.ciphertext));
  return new TextDecoder().decode(pt);
}

export const hashText = (s: string) => keccak256(toBytes(s));
export const hashEnvelopeJson = (json: string) => keccak256(toBytes(json));
export { toHex };
