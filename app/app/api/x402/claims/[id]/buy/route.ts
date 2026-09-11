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

  // currentPrice reads block.timestamp, and the load-balanced RPC can serve the paid retry from a node a few blocks
  // behind the one that quoted the 402, so it sees a higher price than the buyer signed for and the facilitator rejects
  // (invalid_exact_evm_payload_authorization_value). Quote the price as of 60s ago instead: it covers any such lag,
  // only falls between the 402 and the retry, and always covers the price when purchaseFor executes. The sub-cent
  // excess stays with the relayer.
  const LAG = 60n;
  const t = BigInt(Math.floor(Date.now() / 1000)) - LAG;
  const span = canBuy.exclusivityEnd - canBuy.committedAt;
  const el = t <= canBuy.committedAt ? 0n : t - canBuy.committedAt;
  const lagged = canBuy.upfront - ((canBuy.upfront / 2n) * (el < span ? el : span)) / (span > 0n ? span : 1n) + canBuy.contingent;
  const quote = lagged > price ? lagged : price;
  const requirements = requirementsFor(new URL(req.url).toString(), quote, `Verity sealed claim #${id}: upfront + contingent tranche (${usd(quote)})`, r.account.address);
  const header = req.headers.get("x-payment");
  if (!header) return paymentRequired(requirements);

  // Refuse before settlement if this payer already owns the claim — never take money for a purchase that will revert.
  try {
    const from = JSON.parse(atob(header)).payload?.authorization?.from as `0x${string}` | undefined;
    if (from && (await publicClient.readContract({ address: MARKET, abi: marketAbi, functionName: "purchased", args: [id, from] })))
      return Response.json({ error: "already purchased — request the key at /api/key/" + id }, { status: 409 });
  } catch {}

  // Every failure below reports its stage as JSON. After "settle", USDC has moved to the relayer, so a failure
  // there must name the payment tx so the purchase can be completed or refunded — never a bare 500.
  let stage = "verify+settle";
  let paid: Awaited<ReturnType<typeof collect>> | null = null;
  let hash: `0x${string}`;
  let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
  try {
    paid = await collect(header, requirements);
    if (!paid.ok) return paymentRequired(requirements, paid.error);

    stage = "relayer-approve";
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
    stage = "purchaseFor";
    hash = await r.writeContract({ address: MARKET, abi: marketAbi, functionName: "purchaseFor", args: [id, paid.payer] });
    receipt = await publicClient.waitForTransactionReceipt({ hash });
  } catch (e) {
    const detail = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    console.error(`[x402 buy #${id}] failed at ${stage}:`, e);
    return Response.json(
      {
        error: `purchase failed at ${stage}`,
        detail: detail.slice(0, 500),
        paymentTx: paid?.ok ? txUrl(paid.tx) : null,
        note: paid?.ok ? "USDC was settled to the relayer but escrow did not complete — contact the operator for completion or refund" : "no funds moved",
      },
      { status: 502 },
    );
  }
  const body = {
    claimId: id.toString(),
    buyer: paid.payer,
    paid: quote.toString(),
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
