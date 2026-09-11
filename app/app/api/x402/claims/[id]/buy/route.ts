// Agent purchase over x402. GET without X-PAYMENT -> 402 with the claim's current (decayed) price.
// GET with X-PAYMENT -> facilitator settles USDC to the relayer -> relayer calls purchaseFor(claimId, payer).
import { marketAbi, erc20Abi } from "@/lib/abi";
import { MARKET, USDC, publicClient, txUrl, usd } from "@/lib/chain";
import { collect, paymentRequired, relayer, requirementsFor } from "@/lib/x402";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = BigInt((await params).id);
  const r = relayer();
  // Quote 30s ahead of decay so the paid amount always covers the on-chain price at execution.
  const price = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "currentPrice", args: [id] });
  const canBuy = await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "getClaim", args: [id] });
  if (canBuy.status !== 0 || BigInt(Math.floor(Date.now() / 1000)) >= canBuy.exclusivityEnd)
    return Response.json({ error: "claim is not purchasable (settled, in resolution, or exclusivity expired — key is public)" }, { status: 409 });

  const requirements = requirementsFor(new URL(req.url).toString(), price, `Verity sealed claim #${id}: upfront + contingent tranche (${usd(price)})`, r.account.address);
  const header = req.headers.get("x-payment");
  if (!header) return paymentRequired(requirements);

  // Refuse before settlement if this payer already owns the claim — never take money for a purchase that will revert.
  try {
    const from = JSON.parse(atob(header)).payload?.authorization?.from as `0x${string}` | undefined;
    if (from && (await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "purchased", args: [id, from] })))
      return Response.json({ error: "already purchased — request the key at /api/key/" + id }, { status: 409 });
  } catch {}

  const paid = await collect(header, requirements);
  if (!paid.ok) return paymentRequired(requirements, paid.error);

  const allowance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [r.account.address, MARKET] });
  if (allowance < price) {
    const h = await r.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [MARKET, 2n ** 255n] });
    await publicClient.waitForTransactionReceipt({ hash: h });
    // Load-balanced RPC: wait until the approval is visible before purchaseFor estimates gas against it.
    for (let i = 0; i < 30; i++) {
      const a = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [r.account.address, MARKET] });
      if (a >= price) break;
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
  const hash = await r.writeContract({ address: MARKET, abi: marketAbi, functionName: "purchaseFor", args: [id, paid.payer] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const body = {
    claimId: id.toString(),
    buyer: paid.payer,
    paid: price.toString(),
    paymentTx: txUrl(paid.tx),
    purchaseTx: txUrl(hash),
    status: receipt.status,
    next: `POST /api/key/${id} with a signature from ${paid.payer} to receive the decryption key`,
  };
  return Response.json(body, {
    status: receipt.status === "success" ? 200 : 500,
    headers: { "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ success: true, transaction: paid.tx, network: "base-sepolia", payer: paid.payer })).toString("base64") },
  });
}
