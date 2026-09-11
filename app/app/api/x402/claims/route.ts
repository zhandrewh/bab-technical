// Agent surface: list open claims with every pre-purchase signal. Public metadata only — the package stays sealed.
import { loadMarket } from "@/lib/claims";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const { claims } = await loadMarket();
  const rows = claims
    .filter((c) => !status || c.status === status.toUpperCase())
    .map(({ bloom, ...c }) => ({
      ...c,
      bloomFilter: bloom,
      preview: `${url.origin}/api/x402/claims/${c.id}/preview`,
      buy: `${url.origin}/api/x402/claims/${c.id}/buy`,
      key: `${url.origin}/api/key/${c.id}`,
    }));
  return Response.json({
    market: process.env.NEXT_PUBLIC_MARKET_ADDRESS,
    note: "Intersect bloomFilter with your beat locally (keccak256, 512 bits, k=4; see lib/bloom.ts). Buy via x402 on the `buy` URL.",
    claims: rows,
  });
}
