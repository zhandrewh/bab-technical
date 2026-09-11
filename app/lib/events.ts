// Event-log indexer. The live feed and calibration scores are both built from the log — no database.
import { parseEventLogs, type Address, type Hex } from "viem";
import { bidsAbi, marketAbi } from "./abi";
import { BIDS, DEPLOY_BLOCK, MARKET, publicClient } from "./chain";

const CHUNK = 9_000n;
// The public RPC is load-balanced; a lagging node returns no logs for the newest blocks. Only cache ranges this far
// behind the head as final, and rescan the tail on every call so a late node never hides an event permanently.
const FINALITY = 10n;

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
  const safe = latest.number > FINALITY ? latest.number - FINALITY : 0n;
  let safeCount = events.length;
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
  safeCount = events.filter((e) => BigInt(e.block) <= safe).length;
  const cachedTo = safe > (cache?.toBlock ?? DEPLOY_BLOCK - 1n) ? safe : (cache?.toBlock ?? DEPLOY_BLOCK - 1n);
  cache = { toBlock: cachedTo, events: events.slice(0, safeCount), latestTs: Number(latest.timestamp) };
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

/** Reuses the chunked indexer: a single getLogs from the deploy block breaks once the chain passes the RPC's
 *  10,000-block range limit (about 5.5 hours on Base). */
export async function getCommitted(claimId: bigint): Promise<(CommittedArgs & { tx: Hex; block: bigint }) | null> {
  const e = (await getAllEvents()).find((x) => x.kind === "Committed" && x.claimId === claimId.toString());
  if (!e) return null;
  const a = e.args as Record<string, string | number>;
  return {
    claimId,
    seller: a.seller as Address,
    claimHash: a.claimHash as Hex,
    payloadHash: a.payloadHash as Hex,
    resolverId: a.resolverId as Hex,
    domain: a.domain as Hex,
    deadline: BigInt(a.deadline),
    exclusivityEnd: BigInt(a.exclusivityEnd),
    upfront: BigInt(a.upfront),
    contingent: BigInt(a.contingent),
    bond: BigInt(a.bond),
    confidenceBps: Number(a.confidenceBps),
    payloadURI: a.payloadURI as string,
    bloom: a.bloom as Hex,
    tx: e.tx,
    block: BigInt(e.block),
  };
}
