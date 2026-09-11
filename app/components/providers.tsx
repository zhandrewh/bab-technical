"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
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
