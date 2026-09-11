import { getAllEvents } from "@/lib/events";
import { publicClient, BIDS } from "@/lib/chain";
import { bidsAbi } from "@/lib/abi";
import { loadMarket } from "@/lib/claims";
import { BidsClient, type BidRow } from "@/components/bids-client";
import { Rule } from "@/components/ui";
import { b32 } from "@/lib/calibration";

export const dynamic = "force-dynamic";

export default async function BidsPage() {
  let bids: BidRow[] = [];
  let openClaims: { id: string; seller: string; price: string; resolver: string }[] = [];
  try {
    const events = await getAllEvents();
    const posted = events.filter((e) => e.kind === "BidPosted");
    const state = posted.length
      ? await publicClient.multicall({ contracts: posted.map((e) => ({ address: BIDS, abi: bidsAbi, functionName: "getBid", args: [BigInt(e.bidId!)] })), allowFailure: true })
      : [];
    bids = posted.map((e, i) => {
      const s = state[i].result as { open: boolean } | undefined;
      const filled = events.find((f) => f.kind === "BidFilled" && f.bidId === e.bidId);
      return {
        id: e.bidId!,
        bidder: e.args.bidder as string,
        amount: e.args.amount as string,
        domain: b32(e.args.domain),
        resolver: b32(e.args.resolverId) || "any",
        maxBrier: Number(e.args.maxBrierBps) / 10_000,
        expiry: Number(e.args.expiry),
        criteria: e.args.criteria as string,
        open: s?.open ?? false,
        filledWith: filled?.args.claimId as string | undefined,
        tx: e.tx,
      };
    }).reverse();
    openClaims = (await loadMarket()).claims
      .filter((c) => c.status === "OPEN" && c.exclusivityEnd > Date.now() / 1000)
      .map((c) => ({ id: c.id, seller: c.seller, price: (BigInt(c.currentUpfront) + BigInt(c.contingent)).toString(), resolver: c.resolver }));
  } catch {}
  return (
    <div className="space-y-6">
      <Rule left="standing bids" right="where liquidity lives" />
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        A newsroom posts “$2,000 for any resolvable claim touching HHS contracting, seller Brier under 0.20,” escrows the USDC, and sellers fill
        the order with a committed claim. A market with bids and no inventory recruits sellers. A market with inventory and no bids dies.
      </p>
      <BidsClient bids={bids} openClaims={openClaims} />
    </div>
  );
}
