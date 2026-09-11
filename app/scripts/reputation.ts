// ERC-8004 bridge. Sellers register an agent identity (ERC-721) in the Identity Registry; after every settlement
// the oracle writes calibration feedback to the Reputation Registry. Failure here never blocks settlement — the
// event-log mirror (lib/calibration.ts) is the source the app renders from.
import { parseAbi, keccak256, toBytes, type Address } from "viem";
import { log, dim, wallet, send, publicClient, type Role } from "./env";
import { IDENTITY_REGISTRY, REPUTATION_REGISTRY, MARKET, OUTCOMES } from "../lib/chain";
import { marketAbi } from "../lib/abi";

const identityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
const reputationAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

export async function agentIdOf(owner: Address): Promise<bigint | null> {
  // The public RPC caps getLogs at 10,000 blocks; look back at most 9,000 from the head.
  const head = await publicClient.getBlockNumber();
  const floor = BigInt(process.env.ERC8004_FROM_BLOCK ?? process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0);
  const logs = await publicClient.getLogs({
    address: IDENTITY_REGISTRY,
    event: identityAbi[1],
    args: { owner },
    fromBlock: head - 9_000n > floor ? head - 9_000n : floor,
  });
  return logs.length ? logs[logs.length - 1].args.agentId! : null;
}

export async function ensureAgent(role: Role, uri: string): Promise<bigint> {
  const w = wallet(role);
  const existing = await agentIdOf(w.account.address);
  if (existing !== null) return existing;
  const r = await send("erc8004", `register ${role.toLowerCase()} agent identity`, w.writeContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [uri] }));
  const id = (await agentIdOf(w.account.address)) ?? 0n;
  dim(`agentId ${id} (block ${r.blockNumber})`);
  return id;
}

/** Feedback value: 100 = perfectly calibrated on this claim, 0 = maximally wrong. (1 - (p - o)^2) * 100. */
export async function pushReputation(claimId: bigint) {
  const c = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [claimId] });
  const agentId = await agentIdOf(c.seller);
  if (agentId === null) {
    dim(`seller ${c.seller.slice(0, 10)}… has no ERC-8004 identity; local mirror only`);
    return;
  }
  const outcome = OUTCOMES[c.outcome];
  const p = c.confidenceBps / 10_000;
  const o = outcome === "TRUE" ? 1 : 0;
  const value = BigInt(Math.round((1 - (p - o) ** 2) * 100));
  const uri = `${process.env.VERITY_API || "https://verity"}/claim/${claimId}`;
  await send(
    "erc8004",
    `reputation feedback for agent ${agentId}: ${value}/100 (${outcome})`,
    wallet("ORACLE").writeContract({
      address: REPUTATION_REGISTRY,
      abi: reputationAbi,
      functionName: "giveFeedback",
      args: [agentId, value, 0, "verity-calibration", outcome.toLowerCase(), "", uri, keccak256(toBytes(`${MARKET}:${claimId}:${outcome}`))],
    }),
  );
  log("erc8004", `pushed to Reputation Registry ${REPUTATION_REGISTRY}`);
}
