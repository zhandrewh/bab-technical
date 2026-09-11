import { loadBids } from "@/lib/bids";
import { loadMarket } from "@/lib/claims";
import { BIDS, addrUrl } from "@/lib/chain";
import { BidBoard } from "@/components/bid-board";
import { Rule, ErrorNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BidsPage() {
  let error = "";
  let bids: Awaited<ReturnType<typeof loadBids>> = [];
  let claims: Awaited<ReturnType<typeof loadMarket>>["claims"] = [];
  try {
    [bids, { claims }] = await Promise.all([loadBids(), loadMarket()]);
  } catch (e) {
    error = (e as Error).message;
  }
  const now = Date.now() / 1000;
  return (
    <div className="space-y-6">
      <Rule
        left="standing bids"
        right={
          <>
            {bids.filter((b) => b.open && b.expiry > now).length} open · {bids.length} total ·{" "}
            <a href={addrUrl(BIDS)} target="_blank" rel="noreferrer" className="hover:text-gold">StandingBids ↗</a>
          </>
        }
      />
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        Post the price you would pay for a basket you have not seen yet. Your USDC sits in the StandingBids contract until a seller fills the bid with
        a committed basket, which buys it for you through purchaseFor and refunds anything above the ask. You can cancel an open bid at any time and
        get the full amount back.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <BidBoard bids={bids} openClaims={claims.filter((c) => c.status === "OPEN" && c.exclusivityEnd > now).map((c) => ({ id: c.id, teaser: c.teaser, seller: c.seller, resolver: c.resolver, price: (BigInt(c.currentUpfront) + BigInt(c.contingent)).toString() }))} />
    </div>
  );
}
