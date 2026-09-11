// Relevance preview. Two modes:
//  - GET              -> the Bloom filter itself; intersect locally and your beat never leaves your machine (preferred).
//  - GET ?beat=a,b,c  -> convenience: server computes the count. This reveals your beat to the Verity server
//                        (never to the seller). Response is a count only.
import { loadClaim } from "@/lib/claims";
import { overlapCount } from "@/lib/bloom";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { claim } = await loadClaim((await params).id);
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });
  const beat = new URL(req.url).searchParams.get("beat");
  return Response.json({
    claimId: claim.id,
    bloomFilter: claim.bloom,
    bloomParams: { bits: 512, k: 4, hash: "keccak256(normalize(id))" },
    overlap: beat ? overlapCount(claim.bloom, beat.split(",")) : undefined,
    duplicateWarning: claim.novelty > 0 ? `${claim.novelty} prior open commit(s) touch overlapping entities` : null,
    limitation: "Bloom filter, not PSI: probeable by a determined buyer. See DESIGN.md.",
  });
}
