// Standing bids read model: BidPosted events joined with live getBid() state.
import { hexToString, type Hex } from "viem";
import { bidsAbi } from "./abi";
import { BIDS, publicClient } from "./chain";
import { getAllEvents } from "./events";

export type BidView = {
  id: string;
  bidder: string;
  amount: string;
  expiry: number;
  maxBrierBps: number;
  open: boolean;
  domain: string;
  resolver: string; // "" = any whitelisted resolver
  criteria: string;
  postTx: string;
  filledWith: string | null; // claim id
  fillTx: string | null;
  cancelled: boolean;
};

const s32 = (h: string) => (/^0x0*$/.test(h) ? "" : hexToString(h as Hex, { size: 32 }).replace(/\0/g, ""));

export async function loadBids(): Promise<BidView[]> {
  if (/^0x0+$/.test(BIDS)) return [];
  const events = (await getAllEvents()).filter((e) => e.contract === "bids");
  const posted = events.filter((e) => e.kind === "BidPosted");
  if (!posted.length) return [];
  const reads = await publicClient.multicall({
    contracts: posted.map((e) => ({ address: BIDS, abi: bidsAbi, functionName: "getBid", args: [BigInt(e.bidId!)] }) as const),
    allowFailure: true,
  });
  return posted
    .map((e, i) => {
      const a = e.args as Record<string, string>;
      const live = reads[i].result as { open: boolean } | undefined;
      const fill = events.find((x) => x.kind === "BidFilled" && x.bidId === e.bidId);
      return {
        id: e.bidId!,
        bidder: a.bidder,
        amount: a.amount,
        expiry: Number(a.expiry),
        maxBrierBps: Number(a.maxBrierBps),
        open: live?.open ?? !fill,
        domain: s32(a.domain),
        resolver: s32(a.resolverId),
        criteria: a.criteria,
        postTx: e.tx,
        filledWith: fill ? String(fill.args.claimId) : null,
        fillTx: fill?.tx ?? null,
        cancelled: events.some((x) => x.kind === "BidCancelled" && x.bidId === e.bidId),
      };
    })
    .reverse();
}
