"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const cls = "border px-2 py-1 text-[10px] uppercase tracking-widest transition-colors";

  if (!isConnected)
    return (
      <button
        className={`${cls} border-border text-gold-dim hover:border-gold hover:text-gold`}
        onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: baseSepolia.id })}
        disabled={isPending}
      >
        {isPending ? "[ waiting for wallet… ]" : "[ connect ]"}
      </button>
    );
  if (chainId !== baseSepolia.id)
    return (
      <button className={`${cls} border-danger/50 text-danger hover:bg-danger hover:text-background`} onClick={() => switchChain({ chainId: baseSepolia.id })}>
        [ switch to base sepolia ]
      </button>
    );
  return (
    <button className={`${cls} border-gold-dim text-gold hover:border-gold`} onClick={() => disconnect()} title="disconnect">
      [ {address!.slice(0, 6)}…{address!.slice(-4)} ]
    </button>
  );
}
