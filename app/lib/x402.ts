// x402 (HTTP 402) payment gate for agent purchases. The buyer's agent signs an EIP-3009 USDC authorization to the
// Verity relayer; the public facilitator verifies and settles it; the relayer then calls purchaseFor(claimId, buyer)
// so both tranches land in escrow exactly as a direct purchase would. No browser, no wallet popup.
import { useFacilitator } from "x402/verify";
import { exact } from "x402/schemes";
import type { PaymentRequirements } from "x402/types";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, RPC_URL, USDC } from "./chain";

export const FACILITATOR_URL = (process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator") as `${string}://${string}`;

export function relayer() {
  const pk = process.env.RELAYER_PK as Hex | undefined;
  if (!pk) throw new Error("RELAYER_PK not configured");
  return createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC_URL) });
}

export function requirementsFor(resource: string, amount: bigint, description: string, payTo: Address): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: amount.toString(),
    resource,
    description,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 120,
    asset: USDC,
    extra: { name: "USDC", version: "2" },
  };
}

export const paymentRequired = (req: PaymentRequirements, error = "X-PAYMENT header is required") =>
  Response.json({ x402Version: 1, error, accepts: [req] }, { status: 402 });

/** Verify + settle an X-PAYMENT header. Returns the payer (the buyer) or an error string. */
export async function collect(header: string, req: PaymentRequirements): Promise<{ ok: true; payer: Address; tx: string } | { ok: false; error: string }> {
  const { verify, settle } = useFacilitator({ url: FACILITATOR_URL });
  let payload;
  try {
    payload = exact.evm.decodePayment(header);
    payload.x402Version = 1;
  } catch {
    return { ok: false, error: "malformed X-PAYMENT" };
  }
  const v = await verify(payload, req);
  if (!v.isValid) return { ok: false, error: `payment invalid: ${v.invalidReason}` };
  const s = await settle(payload, req);
  if (!s.success) return { ok: false, error: `settlement failed: ${s.errorReason}` };
  return { ok: true, payer: (v.payer ?? s.payer) as Address, tx: s.transaction };
}
