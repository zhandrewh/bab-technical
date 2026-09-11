import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

export const chain = baseSepolia;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
export const EXPLORER = "https://sepolia.basescan.org";

export const MARKET = (process.env.NEXT_PUBLIC_MARKET_ADDRESS || "0x0000000000000000000000000000000000000000") as Address;
export const BIDS = (process.env.NEXT_PUBLIC_BIDS_ADDRESS || "0x0000000000000000000000000000000000000000") as Address;
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
// Guarded: a non-numeric value (e.g. a redacted placeholder from `vercel pull`) must not crash the build.
const rawDeployBlock = (process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "").trim().replace(/^"|"$/g, "");
export const DEPLOY_BLOCK = /^\d+$/.test(rawDeployBlock) ? BigInt(rawDeployBlock) : 0n;
export const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address;
export const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
export const CUSTODIAN_PUBKEY = process.env.NEXT_PUBLIC_CUSTODIAN_PUBKEY || "";

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;

export const OUTCOMES = ["NONE", "TRUE", "FALSE", "FABRICATED"] as const;
export const STATUSES = ["OPEN", "PROPOSED", "DISPUTED", "SETTLED"] as const;

/** USDC has 6 decimals. Always show dollars, never base units. */
export const usd = (v: bigint | number) => {
  const n = typeof v === "bigint" ? Number(v) / 1e6 : v / 1e6;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;
};
