import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agent discovery: the manifest also answers at the conventional well-known path.
  async rewrites() {
    return [{ source: "/.well-known/agent.json", destination: "/api/agents" }];
  },
};

export default nextConfig;
