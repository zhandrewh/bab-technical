// Basket commitment (spec 1). Each sealed item is canonical JSON with a 32-byte salt, so a root reveals nothing and an
// item cannot be guessed and checked. Compatible with OpenZeppelin MerkleProof (sorted pairs) and VerityMarket.itemLeaf:
//   itemHash = keccak256(canonicalJSON(item))
//   leaf     = keccak256(keccak256(abi.encode(uint256 index, bytes32 itemHash)))
import { concat, encodeAbiParameters, keccak256, toBytes, toHex, type Hex } from "viem";

/** Stable JSON: object keys sorted recursively, no whitespace. The exact bytes that are hashed. */
export function canonicalJSON(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export const randomSalt = (): Hex => toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
export const itemHash = (item: unknown): Hex => keccak256(toBytes(canonicalJSON(item)));
export const itemLeaf = (index: number, h: Hex): Hex =>
  keccak256(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [BigInt(index), h])));

const hashPair = (a: Hex, b: Hex): Hex => keccak256(BigInt(a) < BigInt(b) ? concat([a, b]) : concat([b, a]));

/** Layers bottom-up; an odd node is promoted unchanged (OZ-compatible for sorted-pair verification). */
function layers(leaves: Hex[]): Hex[][] {
  if (!leaves.length) throw new Error("empty basket");
  const out = [leaves];
  while (out[out.length - 1].length > 1) {
    const cur = out[out.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: Hex[]): Hex {
  const l = layers(leaves);
  return l[l.length - 1][0];
}

export function merkleProof(leaves: Hex[], index: number): Hex[] {
  const proof: Hex[] = [];
  let i = index;
  for (const layer of layers(leaves).slice(0, -1)) {
    const sib = i ^ 1;
    if (sib < layer.length) proof.push(layer[sib]);
    i >>= 1;
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  return proof.reduce((acc, p) => hashPair(acc, p), leaf).toLowerCase() === root.toLowerCase();
}

/** Root and per-item leaves for a basket of items (each already carrying its salt). */
export function commitBasket(items: unknown[]) {
  const hashes = items.map(itemHash);
  const leaves = hashes.map((h, i) => itemLeaf(i, h));
  return { root: merkleRoot(leaves), hashes, leaves, proof: (i: number) => merkleProof(leaves, i) };
}
