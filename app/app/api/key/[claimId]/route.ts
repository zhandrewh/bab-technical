// Key-release endpoint. POST { address, signature, issuedAt } -> { key } iff canDecrypt(claimId, address).
// The seller is not involved: the key was sealed to this layer at commit, and release reads chain state only.
import { NextResponse } from "next/server";
import { defaultProvider } from "@/lib/keyRelease";
import type { Address, Hex } from "viem";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  const body = (await req.json().catch(() => ({}))) as { address?: Address; signature?: Hex; issuedAt?: number };
  if (!body.address || !body.signature || !body.issuedAt) return NextResponse.json({ error: "address, signature, issuedAt required" }, { status: 400 });
  try {
    const provider = defaultProvider();
    const r = await provider.requestKey(BigInt(claimId), body.address, { signature: body.signature, issuedAt: body.issuedAt });
    if (!r.ok) return NextResponse.json({ error: r.error, provider: provider.name }, { status: r.status });
    return NextResponse.json({ key: r.key, reason: r.reason, provider: provider.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
