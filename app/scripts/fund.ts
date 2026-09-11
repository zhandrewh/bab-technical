// Distribute faucet ETH + USDC from the deployer to the agent wallets.
import { parseEther, formatEther } from "viem";
import { log, wallet, send, publicClient, type Role } from "./env";
import { USDC } from "../lib/chain";
import { erc20Abi } from "../lib/abi";

const PLAN: Record<Exclude<Role, "DEPLOYER">, { eth: string; usdc: bigint }> = {
  SELLER: { eth: "0.004", usdc: 5_000_000n },
  FABRICATOR: { eth: "0.003", usdc: 3_000_000n },
  BUYER: { eth: "0.003", usdc: 5_000_000n },
  ORACLE: { eth: "0.006", usdc: 2_000_000n },
  RELAYER: { eth: "0.003", usdc: 2_000_000n },
};

(async () => {
  const d = wallet("DEPLOYER");
  log("fund", `deployer ${d.account.address}: ${formatEther(await publicClient.getBalance({ address: d.account.address }))} ETH`);
  for (const [role, amt] of Object.entries(PLAN) as [Role, { eth: string; usdc: bigint }][]) {
    const to = wallet(role).account.address;
    const bal = await publicClient.getBalance({ address: to });
    if (bal < parseEther(amt.eth) / 2n) await send("fund", `${amt.eth} ETH -> ${role}`, d.sendTransaction({ to, value: parseEther(amt.eth) }));
    const u = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [to] });
    if (u < amt.usdc / 2n) await send("fund", `${Number(amt.usdc) / 1e6} USDC -> ${role}`, d.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [to, amt.usdc] }));
  }
})().catch((e) => (console.error(e), process.exit(1)));
