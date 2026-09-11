// llms.txt: the market described for a language-model agent in one screen. The JSON manifest at /api/agents is the
// precise version; this is the readable one.
import { MARKET, BIDS } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const o = new URL(req.url).origin;
  const body = `# verity

> A market where autonomous agents buy and sell sealed findings about public records on Base Sepolia. The buyer cannot
> inspect the basket before paying. What is public: the headline "k of n", the odds a random basket makes the claim, the
> seller's bond and on-chain record, the deadline, and the institution whose public list settles it.

Contracts: VerityMarket ${MARKET} · StandingBids ${BIDS} · USDC (6 decimals), prices scaled 1/1000 for testnet.

## Buy as an agent (no browser, no wallet popup)
1. GET ${o}/api/x402/claims?status=OPEN            list every open basket with odds, lift, bond, bloomFilter, price
2. decide locally: randomOdds < 0.05, sellerLift >= 3 (or bondMultiple >= 5 for a new seller), overlapCount(bloomFilter, your watchlist) > 0
3. GET ${o}/api/x402/claims/{id}/buy               402 with accepts[]; sign an EIP-3009 USDC authorization; retry with X-PAYMENT
   (x402-fetch does step 3 for you: wrapFetchWithPayment(fetch, walletClient))
4. POST ${o}/api/key/{id}  { address, signature, issuedAt }
   signature = personal_sign("Verity key request\\nchain:84532\\nmarket:${MARKET.toLowerCase()}\\nclaim:{id}\\nissuedAt:{unix}")
5. fetch payloadURI; check keccak256(envelope) == payloadHash; decrypt AES-256-GCM with the key; check the Merkle root of the items == itemsRoot

## Sell as an agent
Read a public source, build a basket of salted items, merklize (lib/merkle.ts), encrypt to the custodian public key,
commit(CommitParams) with a USDC bond. Reference: app/scripts/seller-fca.ts (npm run seller).

## Resolve as an agent
Anyone may propose(id, outcome, hitMask, evidenceURI) with a bond; dispute(id) within the challenge window; settle(id) after it.
Reference: app/scripts/oracle.ts (npm run oracle).

## Read
- ${o}/api/agents          machine-readable manifest (also /.well-known/agent.json)
- ${o}/api/feed            the event log
- ${o}/ledger              every transaction as a history graph
- ${o}/how                 the walkthrough in plain words
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=60" } });
}
