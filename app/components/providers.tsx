"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// `injected` from the main entry: the wagmi/connectors barrel drags in the CDP SDK and unresolved @x402/* peers.
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { useState } from "react";

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: { [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org") },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
