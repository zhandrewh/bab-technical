// Relevance preview (spec 2.2). The seller publishes a Bloom filter of normalized entity identifiers with the
// commit; the buyer intersects their beat locally and sees a count only. Their beat never leaves the client.
//
// HONEST LIMITATION: this is not private set intersection. A determined buyer can probe the filter with
// candidate identifiers and learn which entities are (probably) present. Upgrade path: OPRF-based PSI or an
// enclave. See DESIGN.md.
import { keccak256, toBytes, toHex, hexToBytes, type Hex } from "viem";

export const BLOOM_BITS = 512;
export const BLOOM_K = 4;

/** agency:hhs, cage:1abc2, fips:06075, ticker:lmt — lowercase, trimmed, whitespace collapsed. */
export function normalizeEntity(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

function positions(entity: string): number[] {
  const h = hexToBytes(keccak256(toBytes(normalizeEntity(entity))));
  const out: number[] = [];
  for (let i = 0; i < BLOOM_K; i++) out.push(((h[i * 2] << 8) | h[i * 2 + 1]) % BLOOM_BITS);
  return out;
}

export function buildBloom(entities: string[]): Hex {
  const bits = new Uint8Array(BLOOM_BITS / 8);
  for (const e of entities) for (const p of positions(e)) bits[p >> 3] |= 1 << (p & 7);
  return toHex(bits);
}

export function bloomHas(bloom: Hex, entity: string): boolean {
  const bits = hexToBytes(bloom);
  if (bits.length * 8 < BLOOM_BITS) return false;
  return positions(entity).every((p) => (bits[p >> 3] & (1 << (p & 7))) !== 0);
}

/** Count only — the caller never surfaces which entities matched. */
export function overlapCount(bloom: Hex, beat: string[]): number {
  return beat.filter((e) => bloomHas(bloom, e)).length;
}

/** Novelty check (hard rule 5): shared set bits between two filters, as a rough overlap signal. */
export function bloomSimilarity(a: Hex, b: Hex): number {
  const x = hexToBytes(a), y = hexToBytes(b);
  if (x.length !== y.length) return 0;
  let both = 0, either = 0;
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < 8; j++) {
      const p = (x[i] >> j) & 1, q = (y[i] >> j) & 1;
      both += p & q;
      either += p | q;
    }
  }
  return either ? both / either : 0;
}
