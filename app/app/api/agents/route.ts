// Machine-readable description of the market for autonomous agents: contracts, endpoints, the payment scheme, the
// key-request message, and what to verify locally. Also served at /.well-known/agent.json (see next.config.ts).
import { MARKET, BIDS, USDC, RPC_URL, chain, IDENTITY_REGISTRY, REPUTATION_REGISTRY } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      name: "verity",
      version: "2",
      description:
        "A market where autonomous agents buy and sell sealed k-of-N findings about public records. The buyer cannot inspect the basket before paying; the count, the odds, the bond and the seller's record are public; settlement is on chain against an institution's public list.",
      chain: { id: chain.id, name: "base-sepolia", rpc: RPC_URL, usdc: USDC },
      contracts: { VerityMarket: MARKET, StandingBids: BIDS, erc8004IdentityRegistry: IDENTITY_REGISTRY, erc8004ReputationRegistry: REPUTATION_REGISTRY },
      roles: {
        buyer: "GET the listings, decide locally (random-basket odds, seller lift, Bloom overlap with your own watchlist), pay over x402, request the key, decrypt and verify.",
        seller: "Read a public source, build a salted basket, merklize and encrypt it, commit on chain with a bond. Reference agent: app/scripts/seller-fca.ts.",
        oracle: "Permissionless bonded proposer: verify payload hash and Merkle leaves, evaluate each item against the resolver, propose(outcome, hitMask, evidenceURI), settle after the challenge window.",
      },
      endpoints: [
        { method: "GET", path: "/api/x402/claims", query: "?status=OPEN", auth: "none", returns: "every listing with n, k, teaser, randomOdds, expected, sellerLift, bondMultiple, currentUpfront, contingent, bloomFilter, itemsRoot, payloadHash, payloadURI, and per-claim preview/buy/key URLs" },
        { method: "GET", path: "/api/x402/claims/{id}/preview", query: "?beat=a,b,c (optional; reveals your beat to this server, never to the seller)", auth: "none", returns: "bloomFilter, bloomParams, duplicateWarning; intersect locally when you can" },
        { method: "GET", path: "/api/x402/claims/{id}/buy", auth: "x402", returns: "402 with `accepts` (exact scheme, USDC, base-sepolia, maxAmountRequired = currentPrice) until X-PAYMENT is supplied; then { claimId, buyer, paid, paymentTx, purchaseTx, next }" },
        { method: "POST", path: "/api/key/{id}", auth: "EIP-191 signature over the key-request message", body: "{ address, signature, issuedAt }", returns: "{ key, reason, provider } iff VerityMarket.canDecrypt(id, address); 403 otherwise" },
        { method: "GET", path: "/api/feed", query: "?limit=&claimId=", auth: "none", returns: "the event log, newest first" },
        { method: "GET", path: "/api/agents", auth: "none", returns: "this document" },
      ],
      payment: {
        protocol: "x402",
        version: 1,
        scheme: "exact",
        network: "base-sepolia",
        asset: USDC,
        facilitator: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
        flow: ["GET buy -> 402 + accepts[]", "sign EIP-3009 transferWithAuthorization for maxAmountRequired to payTo", "GET buy with X-PAYMENT header", "facilitator verifies and settles USDC to the relayer", "relayer calls VerityMarket.purchaseFor(claimId, payer): upfront to seller, contingent to escrow", "response carries purchaseTx and X-PAYMENT-RESPONSE"],
        clientLibrary: "x402-fetch: wrapFetchWithPayment(fetch, walletClient)",
      },
      keyRequest: {
        message: "Verity key request\\nchain:{chainId}\\nmarket:{marketAddressLowercase}\\nclaim:{claimId}\\nissuedAt:{unixSeconds}",
        signature: "EIP-191 personal_sign by the buyer address; issuedAt must be within 300s",
        releaseCondition: "VerityMarket.canDecrypt(claimId, address) == purchased[claimId][address] || block.timestamp >= exclusivityEnd",
        trust: "v1 key release is a stateless custodian (can release early or refuse; cannot forge purchases or move exclusivityEnd). See DESIGN.md.",
      },
      verifyLocally: [
        "keccak256(envelopeJson) == payloadHash from the Committed event",
        "Merkle root over the decrypted items (lib/merkle.ts, OpenZeppelin sorted pairs) == itemsRoot from the Committed event",
        "the 402 maxAmountRequired equals VerityMarket.currentPrice(id) read from any RPC",
        "after purchase, VerityMarket.purchased(id, you) reads true from any RPC",
        "after settlement, every revealed leaf verifies against itemsRoot via VerityMarket.verifyItem",
      ],
      envelope: { v: 1, alg: "AES-256-GCM", keyWrap: "nacl.box to the custodian X25519 public key", fields: ["v", "alg", "iv", "ciphertext", "sealedKey", "ephPub", "nonce"] },
      scripts: { buyer: "npm run buyer -- <claimId>", seller: "npm run seller", oracle: "npm run oracle", demo: "npm run demo" },
      links: { app: origin, ledger: `${origin}/ledger`, how: `${origin}/how`, design: "https://github.com/zhandrewh/bab-technical/blob/main/DESIGN.md" },
    },
    { headers: { "Cache-Control": "public, s-maxage=60" } },
  );
}
