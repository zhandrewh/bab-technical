// Event-log indexer. The live feed and calibration scores are both built from the log — no database.
import { parseEventLogs, type Address, type Hex } from "viem";
import { bidsAbi, marketAbi } from "./abi";
import { BIDS, DEPLOY_BLOCK, MARKET, publicClient } from "./chain";

const CHUNK = 9_000n;

export type FeedEvent = {
  kind: string;
  contract: "market" | "bids";
  claimId?: string;
  bidId?: string;
  tx: Hex;
  block: string;
  logIndex: number;
  ts: number; // unix seconds (estimated from block number; Base = 2s blocks)
  args: Record<string, unknown>;
};

let cache: { toBlock: bigint; events: FeedEvent[]; latestTs: number } | null = null;

const jsonable = (v: unknown): unknown =>
  typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(jsonable) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonable(x)]))
    : v;

/** All market + bids events, oldest first. Incrementally cached per server instance. */
export async function getAllEvents(): Promise<FeedEvent[]> {
  const latest = await publicClient.getBlock();
  let from = cache ? cache.toBlock + 1n : DEPLOY_BLOCK;
  const events = cache ? [...cache.events] : [];
  const addresses = [MARKET, BIDS].filter((a) => !/^0x0+$/.test(a)) as Address[];
  if (!addresses.length) return [];
  while (from <= latest.number) {
    const to = from + CHUNK > latest.number ? latest.number : from + CHUNK;
    const logs = await publicClient.getLogs({ address: addresses, fromBlock: from, toBlock: to });
    const market = parseEventLogs({ abi: marketAbi, logs: logs.filter((l) => l.address.toLowerCase() === MARKET.toLowerCase()) });
    const bids = parseEventLogs({ abi: bidsAbi, logs: logs.filter((l) => l.address.toLowerCase() === BIDS.toLowerCase()) });
    for (const [contract, parsed] of [["market", market], ["bids", bids]] as const) {
      for (const l of parsed) {
        const args = jsonable(l.args) as Record<string, unknown>;
        events.push({
          kind: l.eventName,
          contract,
          claimId: args.claimId as string | undefined,
          bidId: args.bidId as string | undefined,
          tx: l.transactionHash!,
          block: l.blockNumber!.toString(),
          logIndex: l.logIndex!,
          ts: Number(latest.timestamp) - Number(latest.number - l.blockNumber!) * 2,
          args,
        });
      }
    }
    from = to + 1n;
  }
  events.sort((a, b) => Number(BigInt(a.block) - BigInt(b.block)) || a.logIndex - b.logIndex);
  cache = { toBlock: latest.number, events, latestTs: Number(latest.timestamp) };
  return events;
}

export type CommittedArgs = {
  claimId: bigint;
  seller: Address;
  claimHash: Hex;
  payloadHash: Hex;
  resolverId: Hex;
  domain: Hex;
  deadline: bigint;
  exclusivityEnd: bigint;
  upfront: bigint;
  contingent: bigint;
  bond: bigint;
  confidenceBps: number;
  payloadURI: string;
  bloom: Hex;
};

export async function getCommitted(claimId: bigint): Promise<(CommittedArgs & { tx: Hex; block: bigint }) | null> {
  const logs = await publicClient.getContractEvents({
    address: MARKET,
    abi: marketAbi,
    eventName: "Committed",
    args: { claimId },
    fromBlock: DEPLOY_BLOCK,
  });
  const l = logs[0];
  return l ? { ...(l.args as CommittedArgs), tx: l.transactionHash, block: l.blockNumber } : null;
}
