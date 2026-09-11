// Event-log indexer. The live feed and calibration scores are both built from the log — no database.
import { parseEventLogs, type Address, type Hex } from "viem";
import { bidsAbi, marketAbi } from "./abi";
import { BIDS, DEPLOY_BLOCK, MARKET, publicClient } from "./chain";
import { BLOCK_MS, memoFor } from "./memo";

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

// Chunks fetched in parallel on a cold scan, bounded so the public RPC does not rate-limit us.
const CONCURRENCY = 4;

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** All market + bids events, oldest first. Incrementally cached per server instance; concurrent and back-to-back
 *  callers within one block share a single scan. */
export const getAllEvents = memoFor(BLOCK_MS, scanEvents);

async function scanEvents(): Promise<FeedEvent[]> {
  const latest = await publicClient.getBlock();
  const from = cache ? cache.toBlock + 1n : DEPLOY_BLOCK;
  const events = cache ? [...cache.events] : [];
  const safe = latest.number > FINALITY ? latest.number - FINALITY : 0n;
  let safeCount = events.length;
  const addresses = [MARKET, BIDS].filter((a) => !/^0x0+$/.test(a)) as Address[];
  if (!addresses.length) return [];
  const ranges: [bigint, bigint][] = [];
  for (let f = from; f <= latest.number; f += CHUNK + 1n) ranges.push([f, f + CHUNK > latest.number ? latest.number : f + CHUNK]);
  const chunks = await mapLimit(ranges, CONCURRENCY, ([fromBlock, toBlock]) => publicClient.getLogs({ address: addresses, fromBlock, toBlock }));
  for (const logs of chunks) {
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
