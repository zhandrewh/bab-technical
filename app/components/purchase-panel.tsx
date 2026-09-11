"use client";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useSignMessage, useWalletClient, useWriteContract } from "wagmi";
import { marketAbi, erc20Abi } from "@/lib/abi";
import { MARKET, USDC, usd } from "@/lib/chain";
import { keyRequestMessage } from "@/lib/keyRelease.client";
import { decryptPackage, hashEnvelopeJson } from "@/lib/crypto";
import { fetchEnvelopeJson, parseEnvelope } from "@/lib/storage";
import { overlapCount } from "@/lib/bloom";
import { commitBasket } from "@/lib/merkle";
import type { ClaimView } from "@/lib/claims";
import type { EvidencePackage } from "@/lib/package";
import { Btn, Panel, Rule, TxLink } from "./ui";
import { TxModal, type TxReceipt } from "./tx-modal";

type Method = "x402" | "wallet";
const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "x402", label: "gasless · x402", hint: "One signature. The relayer pays gas and calls purchaseFor for you. Needs only USDC." },
  { id: "wallet", label: "direct · wallet tx", hint: "You send approve (first time) and purchase yourself. Needs USDC and a little Base Sepolia ETH." },
];

/** upfront(t): linear from list to half-list across the exclusivity window. Mirrors currentUpfront() on chain. */
const upfrontAt = (up: bigint, t: number, from: number, to: number) => {
  if (t >= to) return up / 2n;
  const el = BigInt(Math.max(0, Math.floor(t) - from));
  const span = BigInt(Math.max(1, to - from));
  return up - ((up / 2n) * (el < span ? el : span)) / span;
};

function DecayChart({ c, now }: { c: ClaimView; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const up = BigInt(c.upfront), cont = BigInt(c.contingent);
  const W = 280, H = 64, P = 4;
  const from = c.committedAt, to = c.exclusivityEnd;
  const max = Number(up + cont), min = Number(up / 2n + cont);
  const x = (t: number) => P + ((t - from) / Math.max(1, to - from)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / Math.max(1, max - min)) * (H - 2 * P - 12);
  const t = hover ?? Math.min(now, to);
  const v = Number(upfrontAt(up, t, from, to) + cont);
  const fmt = (s: number) => {
    const d = s - now;
    const a = Math.abs(d);
    const u = a < 3600 ? `${Math.round(a / 60)}m` : a < 172800 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
    return Math.abs(d) < 30 ? "now" : d < 0 ? `${u} ago` : `in ${u}`;
  };
  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair"
        role="img"
        aria-label={`Ask decays from ${usd(up + cont)} to ${usd(up / 2n + cont)} by the end of exclusivity`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width) * W - P) / (W - 2 * P));
          setHover(from + f * (to - from));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={P} x2={W - P} y1={y(min)} y2={y(min)} stroke="var(--border)" strokeDasharray="2 3" />
        <line x1={x(from)} y1={y(max)} x2={x(to)} y2={y(min)} stroke="var(--gold)" strokeWidth={2} strokeLinecap="round" />
        <line x1={x(t)} x2={x(t)} y1={P} y2={H - 12} stroke="var(--gold-dim)" strokeWidth={1} />
        <circle cx={x(t)} cy={y(v)} r={4} fill="var(--gold)" stroke="var(--popover)" strokeWidth={2} />
        <text x={P} y={H - 1} fontSize={9} fill="var(--muted-foreground)">commit</text>
        <text x={W - P} y={H - 1} fontSize={9} fill="var(--muted-foreground)" textAnchor="end">exclusivity ends</text>
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground" suppressHydrationWarning>
        <span>{hover == null ? "ask now" : `ask ${fmt(t)}`}</span>
        <span className="tabular-nums text-foreground">{usd(BigInt(Math.round(v)))}</span>
      </div>
    </div>
  );
}

export function PurchasePanel({ claim: c }: { claim: ClaimView }) {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const [method, setMethod] = useState<Method>("x402");
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [txs, setTxs] = useState<TxReceipt[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [pkg, setPkg] = useState<EvidencePackage | null>(null);
  const [hashOk, setHashOk] = useState<boolean | null>(null);
  const [beat, setBeat] = useState("defendant:lockheed, defendant:raytheon, defendant:aetna, defendant:siemens, court:dcd");
  const overlap = overlapCount(c.bloom, beat.split(",").map((s) => s.trim()).filter(Boolean));
  const rootOk = pkg ? pkg.items.length === c.n && commitBasket(pkg.items).root.toLowerCase() === c.itemsRoot.toLowerCase() : null;
  // Tick locally so the countdown, the decaying ask and the expired state move without a reload.
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil(c.exclusivityEnd - now));
  const expired = left === 0;
  const liveUpfront = upfrontAt(BigInt(c.upfront), now, c.committedAt, c.exclusivityEnd);
  const price = liveUpfront + BigInt(c.contingent);
  const isSeller = address?.toLowerCase() === c.seller.toLowerCase();

  const run = async (fn: () => Promise<void>) => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setStep("");
    }
  };

  const bought = async (receipts: TxReceipt[]) => {
    setTxs(receipts);
    setShowReceipt(true);
    await unlock(true);
  };

  // Gasless, over x402: the buyer signs an EIP-3009 USDC authorization, the facilitator settles it, and the relayer calls
  // purchaseFor(id, buyer). The same path the agents use, so the buyer needs no ETH and no approve transaction.
  const buyX402 = async () => {
    if (!walletClient) throw new Error("wallet not ready — reconnect and try again");
    const { wrapFetchWithPayment } = await import("x402-fetch");
    setStep("sign the USDC payment in your wallet (a signature, not a transaction: no gas)");
    const tracked: typeof fetch = (input, init) => {
      if (new Headers(init?.headers).has("X-PAYMENT")) setStep("signed · settling USDC and escrowing both tranches (the relayer pays gas)");
      return fetch(input, init);
    };
    // The list price is the ceiling: decay only lowers the quote.
    const pay = wrapFetchWithPayment(tracked, walletClient as never, BigInt(c.upfront) + BigInt(c.contingent));
    const res = await pay(`/api/x402/claims/${c.id}/buy`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail ? `${body.error}: ${body.detail}` : (body.error ?? `purchase failed (${res.status})`));
    const hashOf = (u: string) => u.split("/tx/")[1] ?? u;
    await bought([
      { label: `USDC payment · ${usd(BigInt(body.paid))}`, hash: hashOf(body.paymentTx), note: "EIP-3009 transfer from your wallet to the relayer, settled by the x402 facilitator." },
      { label: "escrow · purchaseFor", hash: hashOf(body.purchaseTx), note: "Relayer escrows both tranches in VerityMarket and records you as the buyer." },
    ]);
  };

  // Direct: the buyer's own wallet sends approve (if needed) and purchase(id).
  const buyWallet = async () => {
    const receipts: TxReceipt[] = [];
    const wait = async (label: string, hash: `0x${string}`, note: string) => {
      setStep(`waiting for ${label} to confirm on Base Sepolia`);
      const r = await pc!.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
      receipts.push({ label, hash, note });
    };
    const buffer = price + price / 50n; // 2% headroom; decay only lowers the price
    const allowance = await pc!.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [address!, MARKET] });
    if (allowance < buffer) {
      const amount = buffer > 20_000_000n ? buffer : 20_000_000n; // a round $20 so later purchases are one transaction
      setStep(`approve ${usd(amount)} USDC in your wallet`);
      await wait("USDC approval", await writeContractAsync({ address: USDC, abi: erc20Abi, functionName: "approve", args: [MARKET, amount] }), `Lets VerityMarket pull up to ${usd(amount)}.`);
    }
    setStep("confirm the purchase in your wallet: both tranches go into escrow");
    await wait(`escrow · purchase · ${usd(price)}`, await writeContractAsync({ address: MARKET, abi: marketAbi, functionName: "purchase", args: [BigInt(c.id)] }), "Your wallet escrows both tranches in VerityMarket.");
    await bought(receipts);
  };

  const unlock = async (justBought = false) => {
    setStep("sign the key request (free, no transaction)");
    const issuedAt = Math.floor(Date.now() / 1000);
    const signature = await signMessageAsync({ message: keyRequestMessage(BigInt(c.id), issuedAt) });
    setStep("key-release layer checking canDecrypt() on chain");
    let r: Response;
    let j: { key: string; error?: string };
    for (let i = 0; ; i++) {
      r = await fetch(`/api/key/${c.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, signature, issuedAt }) });
      j = await r.json();
      // The key layer reads a load-balanced rpc that can trail a just-confirmed purchase by a block or two.
      if (r.ok || !justBought || r.status !== 403 || i >= 10) break;
      await new Promise((res) => setTimeout(res, 1500));
    }
    if (!r.ok) throw new Error(`key release refused (${r.status}): ${j.error}`);
    setStep("fetching ciphertext and decrypting in your browser");
    const envJson = await fetchEnvelopeJson(c.payloadURI);
    setHashOk(hashEnvelopeJson(envJson) === c.payloadHash);
    setPkg(JSON.parse(await decryptPackage(parseEnvelope(envJson), j.key)));
  };

  const canBuy = c.status === "OPEN" && !expired && !isSeller && !pkg;

  return (
    <>
      <Panel>
        <Rule left="relevance preview" right="local only" />
        <p className="mt-2 text-[12px] text-muted-foreground">Your beat never leaves this browser. You see a count, not which entities matched.</p>
        <textarea className="mt-2 h-20 field w-full resize-none rounded p-3 text-[12px] outline-none" value={beat} onChange={(e) => setBeat(e.target.value)} />
        <div className="mt-2 text-[13px]">
          touches <span className="text-gold">{overlap}</span> of {beat.split(",").filter((s) => s.trim()).length} entities on your beat
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Bloom filter, not PSI: a determined buyer can probe it. See DESIGN.md.</p>
      </Panel>

      <Panel tone="raised">
        <Rule left="buy blind" right={<span suppressHydrationWarning>{usd(price)}</span>} />
        <div className="mt-3 space-y-1 text-[13px]">
          {c.status === "OPEN" && !expired && (
            <div className="flex justify-between"><span className="text-gold-dim">buying closes in</span><span suppressHydrationWarning className="tabular-nums text-gold">{left < 3600 ? `${left}s` : left < 172800 ? `${Math.round(left / 3600)}h` : `${Math.round(left / 86400)}d`}</span></div>
          )}
          <div className="flex justify-between"><span className="text-gold-dim">upfront → seller now</span><span suppressHydrationWarning className="tabular-nums">{usd(liveUpfront)}</span></div>
          <div className="flex justify-between"><span className="text-gold-dim">contingent → escrow</span><span>{usd(BigInt(c.contingent))}</span></div>
          <div className="flex justify-between"><span className="text-gold-dim">if false, you receive</span><span>{usd(BigInt(c.contingent))} + {usd(BigInt(c.bond) / 4n)}+ of bond</span></div>
          <div className="flex justify-between"><span className="text-gold-dim">if fabricated</span><span>made whole first</span></div>
        </div>
        {c.status === "OPEN" && !expired && <DecayChart c={c} now={now} />}

        {canBuy && address && (
          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="payment method">
            {METHODS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={method === m.id}
                onClick={() => setMethod(m.id)}
                className={`rounded px-3 py-2 text-left text-[12px] transition-colors ${method === m.id ? "surface-gold text-foreground" : "surface text-muted-foreground hover:text-foreground"}`}
              >
                <span className={`font-medium ${method === m.id ? "text-gold" : ""}`}>{method === m.id ? "● " : "○ "}{m.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!address ? (
            <span className="text-[12px] text-muted-foreground">Connect a wallet to buy, or use the agent API (x402).</span>
          ) : pkg ? null : c.status !== "OPEN" || expired ? (
            <Btn onClick={() => run(unlock)} disabled={!!step}>request key</Btn>
          ) : isSeller ? (
            <span className="text-[12px] text-muted-foreground">You are the seller of this claim.</span>
          ) : (
            <>
              <Btn variant="primary" onClick={() => run(method === "x402" ? buyX402 : buyWallet)} disabled={!!step}>purchase {usd(price)}</Btn>
              <Btn onClick={() => run(unlock)} disabled={!!step}>already bought</Btn>
            </>
          )}
        </div>
        {expired && !pkg && <p className="mt-2 text-[12px] text-gold">Exclusivity expired: anyone can request the key now. No purchase needed.</p>}
        {step && <p className="mt-3 text-[12px] text-gold-dim">{step}</p>}
        {txs.length > 0 && (
          <div className="mt-2 space-y-1 text-[12px]">
            {txs.map((t) => <div key={t.hash}>{t.label} ✓ <TxLink hash={t.hash} /></div>)}
            <button className="text-gold-dim underline decoration-gold-faint hover:text-gold" onClick={() => setShowReceipt(true)}>show receipt</button>
          </div>
        )}
        {err && <div className="mt-3 surface-danger rounded px-3 py-2 text-[12px]"><span className="font-medium text-danger">Error:</span> {err}</div>}
      </Panel>

      {showReceipt && (
        <TxModal
          title={`basket #${c.id} purchased`}
          summary={<>Both tranches are escrowed on chain and you are recorded as a buyer. {pkg ? "The basket is decrypted below." : "Sign the key request to decrypt the basket."} The purchase also appears on the ledger.</>}
          txs={txs}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {pkg && (
        <Panel tone="gold">
          <Rule left="unsealed" right={hashOk ? "hash matches commit" : "HASH MISMATCH"} tone={hashOk ? "gold" : "danger"} />
          <p className="mt-3 text-[14px] leading-relaxed text-gold">{pkg.claim.teaser}</p>
          <div className="mt-2 text-[11px]">
            {rootOk ? <span className="text-gold">✓ all {pkg.items.length} items verify against the committed root</span> : <span className="text-danger">basket does not match itemsRoot</span>}
          </div>
          <ol className="mt-3 divide-y divide-border border-y border-border">
            {pkg.items.map((it, i) => (
              <li key={i} className="py-2.5 text-[12px]">
                <div className="font-medium text-foreground">{i + 1}. {it.defendant}</div>
                <div className="text-muted-foreground">
                  {it.court} · {it.docketNumber} · filed {it.entryDate} · watching for “{it.matchTerms.join("” / “")}”
                </div>
                <a href={it.courtlistenerURL} target="_blank" rel="noreferrer" className="text-gold-dim underline decoration-gold-faint hover:text-gold">
                  docket ↗
                </a>
                <span className="ml-2 text-muted-foreground">{it.entryText.slice(0, 140)}</span>
              </li>
            ))}
          </ol>
          <pre className="bab-scroll mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-[12px] text-foreground/85">{pkg.analysis}</pre>
          <div className="mt-3 space-y-1">
            {pkg.sources.map((s) => (
              <div key={s.url} className="text-[12px]">
                <a href={s.url} target="_blank" rel="noreferrer" className="text-gold-dim underline decoration-gold-faint hover:text-gold">{s.title} ↗</a>
                {s.note && <span className="text-muted-foreground"> · {s.note}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
