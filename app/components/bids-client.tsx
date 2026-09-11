"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { stringToHex } from "viem";
import { bidsAbi, erc20Abi } from "@/lib/abi";
import { BIDS, USDC, usd } from "@/lib/chain";
import { Addr, Btn, Panel, Rule, Tag, TxLink } from "./ui";

export type BidRow = {
  id: string;
  bidder: string;
  amount: string;
  domain: string;
  resolver: string;
  maxBrier: number;
  expiry: number;
  criteria: string;
  open: boolean;
  filledWith?: string;
  tx: string;
};

const input = "glass-input w-full rounded-xl px-3 py-2 text-[13px] outline-none";

export function BidsClient({ bids, openClaims }: { bids: BidRow[]; openClaims: { id: string; seller: string; price: string; resolver: string }[] }) {
  const { address } = useAccount();
  const pc = usePublicClient();
  const router = useRouter();
  const { writeContractAsync } = useWriteContract();
  const [criteria, setCriteria] = useState("Any FCA basket touching defense contractors, random-basket odds under 5%");
  const [domain, setDomain] = useState("fca:defense");
  const [resolver, setResolver] = useState("");
  const [amount, setAmount] = useState(2);
  const [maxBrier, setMaxBrier] = useState(0.2);
  const [days, setDays] = useState(14);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [lastTx, setLastTx] = useState("");
  const myClaims = openClaims.filter((c) => c.seller.toLowerCase() === address?.toLowerCase());

  const act = async (label: string, fn: () => Promise<`0x${string}`>) => {
    setErr("");
    try {
      setStep(`confirm ${label} in your wallet`);
      const h = await fn();
      setStep(`waiting for ${label} to confirm on base sepolia`);
      await pc!.waitForTransactionReceipt({ hash: h });
      setLastTx(h);
      router.refresh();
    } catch (e) {
      setErr((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setStep("");
    }
  };

  const post = async () => {
    const amt = BigInt(Math.round(amount * 1e6));
    const allowance = await pc!.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [address!, BIDS] });
    if (allowance < amt) await act("usdc approval", () => writeContractAsync({ address: USDC, abi: erc20Abi, functionName: "approve", args: [BIDS, amt] }));
    await act("post bid", () =>
      writeContractAsync({
        address: BIDS,
        abi: bidsAbi,
        functionName: "postBid",
        args: [stringToHex(domain.slice(0, 31), { size: 32 }), resolver ? stringToHex(resolver, { size: 32 }) : `0x${"0".repeat(64)}`, criteria, amt, Math.round(maxBrier * 10_000), BigInt(Math.floor(Date.now() / 1000 + days * 86400))],
      }),
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <Rule left="open bids" right={`${bids.filter((b) => b.open).length} open`} />
        {bids.length === 0 && <p className="py-6 text-[13px] text-muted-foreground">No standing bids yet. Seed one — bids before inventory is how this market starts.</p>}
        <ul className="divide-y divide-border/40">
          {bids.map((b) => (
            <li key={b.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-gold">{usd(BigInt(b.amount))}</span>
                <span className="text-foreground/90">{b.criteria}</span>
                <span className="h-px flex-1 bg-border" />
                {b.open ? <Tag tone="gold">open</Tag> : b.filledWith ? <Tag>filled #{b.filledWith}</Tag> : <Tag>closed</Tag>}
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>bidder <Addr a={b.bidder} link={false} /></span>
                <span>domain {b.domain}</span>
                <span>resolver {b.resolver}</span>
                <span>seller brier ≤ {b.maxBrier.toFixed(2)}</span>
                <span>expires {new Date(b.expiry * 1000).toISOString().slice(0, 10)}</span>
                <TxLink hash={b.tx} />
              </div>
              {b.open && address && (
                <div className="flex flex-wrap items-center gap-2">
                  {b.bidder.toLowerCase() === address.toLowerCase() && (
                    <Btn variant="danger" disabled={!!step} onClick={() => act("cancel bid", () => writeContractAsync({ address: BIDS, abi: bidsAbi, functionName: "cancelBid", args: [BigInt(b.id)] }))}>cancel · refund</Btn>
                  )}
                  {myClaims
                    .filter((c) => BigInt(c.price) <= BigInt(b.amount) && (b.resolver === "any" || b.resolver === c.resolver))
                    .map((c) => (
                      <Btn key={c.id} variant="primary" disabled={!!step} onClick={() => act(`fill with #${c.id}`, () => writeContractAsync({ address: BIDS, abi: bidsAbi, functionName: "fillBid", args: [BigInt(b.id), BigInt(c.id)] }))}>
                        fill with #{c.id} ({usd(BigInt(c.price))})
                      </Btn>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Panel tone="gold" className="h-fit">
        <Rule left="post a standing bid" />
        <div className="mt-3 space-y-3">
          <label className="grid gap-1"><span className="label">criteria</span><input className={input} value={criteria} onChange={(e) => setCriteria(e.target.value)} /></label>
          <label className="grid gap-1"><span className="label">domain</span><input className={input} value={domain} onChange={(e) => setDomain(e.target.value)} /></label>
          <label className="grid gap-1">
            <span className="label">resolver</span>
            <select className={input} value={resolver} onChange={(e) => setResolver(e.target.value)}>
              <option value="">any</option>
              <option>DOJ_FCA</option>
            </select>
          </label>
          <label className="grid gap-1"><span className="label">escrow (usdc)</span><input type="number" step="0.01" className={input} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
          <label className="grid gap-1"><span className="label">max seller brier · {maxBrier.toFixed(2)}</span><input type="range" min={0.05} max={0.5} step={0.01} value={maxBrier} onChange={(e) => setMaxBrier(Number(e.target.value))} /></label>
          <label className="grid gap-1"><span className="label">expires in {days} days</span><input type="range" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          {address ? <Btn variant="primary" onClick={post} disabled={!!step}>escrow {usd(BigInt(Math.round(amount * 1e6)))} & post</Btn> : <p className="text-[12px] text-muted-foreground">Connect a wallet to post.</p>}
          {step && <p className="text-[12px] text-gold-dim">{step}</p>}
          {lastTx && <p className="text-[12px]">confirmed <TxLink hash={lastTx} /></p>}
          {err && <div className="glass-danger rounded-2xl px-3 py-2 text-[12px]"><span className="font-medium text-danger">Error:</span> {err}</div>}
          <p className="text-[11px] text-muted-foreground">Brier eligibility is checked from the public event log at fill time in v1, not enforced in the contract.</p>
        </div>
      </Panel>
    </div>
  );
}
