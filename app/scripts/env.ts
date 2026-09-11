// Shared bootstrap for agent scripts: loads keys from ../.env.agents and app/.env.local, builds wallet clients.
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "../../.env.agents") });
config({ path: path.resolve(__dirname, "../.env.local") });

import { createWalletClient, http, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, RPC_URL, publicClient, txUrl, USDC } from "../lib/chain";
import { erc20Abi } from "../lib/abi";

export type Role = "DEPLOYER" | "SELLER" | "BUYER" | "ORACLE" | "RELAYER" | "FABRICATOR";

export function wallet(role: Role) {
  const pk = process.env[`${role}_PK`] as Hex | undefined;
  if (!pk) throw new Error(`${role}_PK missing from .env.agents`);
  const account = privateKeyToAccount(pk);
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

const C = { gold: "\x1b[38;2;254;203;51m", dim: "\x1b[38;2;138;110;47m", red: "\x1b[38;2;224;90;58m", reset: "\x1b[0m" };
export const log = (tag: string, msg: string) => console.log(`${C.gold}[${tag}]${C.reset} ${msg}`);
export const dim = (msg: string) => console.log(`${C.dim}   ${msg}${C.reset}`);
export const warn = (tag: string, msg: string) => console.log(`${C.red}[${tag}]${C.reset} ${msg}`);

/** Send a tx, wait for it, print the Basescan link. Every state transition links to the explorer. */
export async function send(tag: string, label: string, p: Promise<Hex>) {
  const hash = await p;
  dim(`${label} … waiting for confirmation ${txUrl(hash)}`);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted: ${txUrl(hash)}`);
  log(tag, `${label} ✓ ${txUrl(hash)}`);
  return r;
}

export async function ensureAllowance(role: Role, spender: Address, amount: bigint) {
  const w = wallet(role);
  const cur = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [w.account.address, spender] });
  if (cur >= amount) return;
  await send(role.toLowerCase(), `approve USDC`, w.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [spender, 2n ** 255n] }));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { publicClient };
