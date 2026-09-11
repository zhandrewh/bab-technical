"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stringToHex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { bidsAbi, erc20Abi } from "@/lib/abi";
import { BIDS, USDC, usd } from "@/lib/chain";
import type { BidView } from "@/lib/bids";
import { Addr, Btn, ErrorNote, Panel, Rule, Tag, TxLink, inputCls } from "./ui";
import { TxModal, type TxReceipt } from "./tx-modal";

type OpenClaim = { id: string; teaser: string; seller: string; resolver: string; price: string };
const ZERO32 = `0x${"0".repeat(64)}` as const;

export function BidBoard({ bids, openClaims }: { bids: BidView[]; openClaims: OpenClaim[] }) {
  const { address } = useAccount();
  const pc = usePublicClient();
  const router = useRouter();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("1.80");
  const [days, setDays] = useState("14");
  const [resolver, setResolver] = useState("DOJ_FCA");
  const [domain, setDomain] = useState("fca:health");
  const [maxBrier, setMaxBrier] = useState("0.20");
  const [criteria, setCriteria] = useState("Any live FCA basket touching health-care contractors, seller Brier under 0.20.");
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [receipt, setReceipt] = useState<{ title: string; summary: string; txs: TxReceipt[] } | null>(null);
  const now = Date.now() / 1000;

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
  const confirm = async (label: string, hash: `0x${string}`, txs: TxReceipt[]) => {
    setStep(`waiting for ${label} to confirm on Base Sepolia`);
    const r = await pc!.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    txs.push({ label, hash });
  };

  const post = () =>
    run(async () => {
      const amt = BigInt(Math.round(Number(amount) * 1e6));
      if (!(amt > 0n)) throw new Error("enter a bid amount");
      const expiry = BigInt(Math.floor(now + Number(days) * 86_400));
      const txs: TxReceipt[] = [];
      const allowance = await pc!.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [address!, BIDS] });
      if (allowance < amt) {
        setStep(`approve ${usd(amt)} USDC for StandingBids in your wallet`);
        await confirm("USDC approval", await writeContractAsync({ address: USDC, abi: erc20Abi, functionName: "approve", args: [BIDS, amt] }), txs);
      }
      setStep("confirm the bid in your wallet: USDC moves into escrow");
      await confirm(
        "bid posted · USDC escrowed",
        await writeContractAsync({
          address: BIDS,
          abi: bidsAbi,
          functionName: "postBid",
          args: [domain ? stringToHex(domain.slice(0, 31), { size: 32 }) : ZERO32, resolver ? stringToHex(resolver, { size: 32 }) : ZERO32, criteria, amt, Math.round(Number(maxBrier || 0) * 10_000), expiry],
        }),
        txs,
      );
      setReceipt({ title: "standing bid posted", summary: `${usd(amt)} is escrowed in StandingBids for ${days} days. A seller can fill it with any basket priced at or below your bid.`, txs });
      router.refresh();
    });

  const cancel = (b: BidView) =>
    run(async () => {
      const txs: TxReceipt[] = [];
      setStep(`confirm cancelling bid #${b.id} in your wallet`);
      await confirm(`bid #${b.id} cancelled · ${usd(BigInt(b.amount))} refunded`, await writeContractAsync({ address: BIDS, abi: bidsAbi, functionName: "cancelBid", args: [BigInt(b.id)] }), txs);
      setReceipt({ title: "bid cancelled", summary: "The full escrow went back to your wallet.", txs });
      router.refresh();
    });

  const fill = (b: BidView, claimId: string) =>
    run(async () => {
      const txs: TxReceipt[] = [];
      setStep(`confirm filling bid #${b.id} with basket #${claimId}`);
      await confirm(`bid #${b.id} filled with basket #${claimId}`, await writeContractAsync({ address: BIDS, abi: bidsAbi, functionName: "fillBid", args: [BigInt(b.id), BigInt(claimId)] }), txs);
      setReceipt({ title: "bid filled", summary: `Basket #${claimId} was bought for the bidder through purchaseFor. Anything above the ask went back to them.`, txs });
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {bids.length === 0 && <Panel><p className="text-[13px] text-muted-foreground">No standing bids yet. Post the first one.</p></Panel>}
        {bids.map((b) => {
          const live = b.open && b.expiry > now;
          const mine = address?.toLowerCase() === b.bidder.toLowerCase();
          const fillable = openClaims.filter((c) => address?.toLowerCase() === c.seller.toLowerCase() && BigInt(c.price) <= BigInt(b.amount) && (!b.resolver || b.resolver === c.resolver));
          return (
            <Panel key={b.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-gold">{usd(BigInt(b.amount))}</span>
                <Tag tone={live ? "gold" : b.filledWith ? "gold" : "dim"}>{b.filledWith ? `filled · #${b.filledWith}` : b.cancelled ? "cancelled" : live ? "open" : "expired"}</Tag>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed">{b.criteria}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                <span>bid #{b.id}</span>
                <span>by <Addr a={b.bidder} /></span>
                <span>{b.resolver || "any resolver"}</span>
                {b.domain && <span>{b.domain}</span>}
                {b.maxBrierBps > 0 && <span>Brier &lt; {(b.maxBrierBps / 10_000).toFixed(2)}</span>}
                <span>{live ? `expires in ${Math.max(1, Math.round((b.expiry - now) / 86_400))}d` : `expired ${new Date(b.expiry * 1000).toISOString().slice(0, 10)}`}</span>
                <TxLink hash={b.postTx} label="post tx" />
                {b.fillTx && <TxLink hash={b.fillTx} label="fill tx" />}
                {b.filledWith && <Link href={`/claim/${b.filledWith}`} className="text-gold-dim hover:text-gold">basket #{b.filledWith} →</Link>}
              </div>
              {live && (mine || fillable.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mine && <Btn variant="danger" disabled={!!step} onClick={() => cancel(b)}>cancel &amp; refund</Btn>}
                  {fillable.map((c) => (
                    <Btn key={c.id} disabled={!!step} onClick={() => fill(b, c.id)}>fill with #{c.id} ({usd(BigInt(c.price))})</Btn>
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel tone="raised" className="h-fit">
        <Rule left="post a bid" right="usdc escrowed" />
        <div className="mt-3 grid gap-3 text-[13px]">
          <label className="grid gap-1"><span className="label">amount (USDC)</span><input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
          <label className="grid gap-1">
            <span className="label">resolver</span>
            <select className={inputCls} value={resolver} onChange={(e) => setResolver(e.target.value)}>
              <option value="">any</option>
              <option>DOJ_FCA</option>
              <option>DOJ_FCA_REPLAY</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="label">domain</span>
            <select className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">any</option>
              <option>fca:health</option>
              <option>fca:defense-tech</option>
              <option>fca:federal</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1"><span className="label">expires in (days)</span><input className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" /></label>
            <label className="grid gap-1"><span className="label">max seller Brier</span><input className={inputCls} value={maxBrier} onChange={(e) => setMaxBrier(e.target.value)} inputMode="decimal" /></label>
          </div>
          <label className="grid gap-1"><span className="label">criteria</span><textarea className={`${inputCls} h-20 resize-none`} value={criteria} onChange={(e) => setCriteria(e.target.value)} /></label>
          <p className="text-[11px] text-muted-foreground">The resolver is enforced on chain. Domain and Brier are criteria that sellers and the UI check; the contract does not.</p>
          {address ? <Btn variant="primary" disabled={!!step} onClick={post}>post bid · {usd(BigInt(Math.round(Number(amount || 0) * 1e6)))}</Btn> : <span className="text-[12px] text-muted-foreground">Connect a wallet to post a bid.</span>}
          {step && <p className="text-[12px] text-gold-dim">{step}</p>}
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      </Panel>

      {receipt && <TxModal {...receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
