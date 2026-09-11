"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const cls = "glass-press rounded-full px-4 py-1.5 text-[13px] font-medium";

  if (!isConnected)
    return (
      <button
        className={`${cls} glass-solid text-background`}
        onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: baseSepolia.id })}
        disabled={isPending}
      >
        {isPending ? "Waiting for wallet…" : "Connect wallet"}
      </button>
    );
  if (chainId !== baseSepolia.id)
    return (
      <button className={`${cls} glass-danger text-danger`} onClick={() => switchChain({ chainId: baseSepolia.id })}>
        Switch to Base Sepolia
      </button>
    );
  return (
    <button className={`${cls} glass-gold flex items-center gap-2 text-gold`} onClick={() => disconnect()} title="disconnect">
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      {address!.slice(0, 6)}…{address!.slice(-4)}
    </button>
  );
}
