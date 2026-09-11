"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from "wagmi";
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

export function PurchasePanel({ claim: c }: { claim: ClaimView }) {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [txs, setTxs] = useState<[string, string][]>([]);
  const [pkg, setPkg] = useState<EvidencePackage | null>(null);
  const [hashOk, setHashOk] = useState<boolean | null>(null);
  const [beat, setBeat] = useState("defendant:lockheed, defendant:raytheon, defendant:aetna, defendant:siemens, court:dcd");
  const overlap = overlapCount(c.bloom, beat.split(",").map((s) => s.trim()).filter(Boolean));
  const rootOk = pkg ? pkg.items.length === c.n && commitBasket(pkg.items).root.toLowerCase() === c.itemsRoot.toLowerCase() : null;
  const price = BigInt(c.currentUpfront) + BigInt(c.contingent);
  const expired = c.exclusivityEnd <= Date.now() / 1000;
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

  const wait = async (label: string, hash: `0x${string}`) => {
    setStep(`waiting for ${label} to confirm on base sepolia`);
    await pc!.waitForTransactionReceipt({ hash });
    setTxs((t) => [...t, [label, hash]]);
  };

  const buy = () =>
    run(async () => {
      const buffer = price + price / 50n; // 2% headroom; decay only lowers the price
      const allowance = await pc!.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [address!, MARKET] });
      if (allowance < buffer) {
        setStep(`approve ${usd(buffer)} USDC in your wallet`);
        await wait("approve", await writeContractAsync({ address: USDC, abi: erc20Abi, functionName: "approve", args: [MARKET, buffer] }));
      }
      setStep("confirm purchase in your wallet — both tranches go into escrow");
      await wait("purchase", await writeContractAsync({ address: MARKET, abi: marketAbi, functionName: "purchase", args: [BigInt(c.id)] }));
      await unlock();
    });

  const unlock = async () => {
    setStep("sign the key request (free, no transaction)");
    const issuedAt = Math.floor(Date.now() / 1000);
    const signature = await signMessageAsync({ message: keyRequestMessage(BigInt(c.id), issuedAt) });
    setStep("key-release layer checking canDecrypt() on chain");
    const r = await fetch(`/api/key/${c.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, signature, issuedAt }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`key release refused (${r.status}): ${j.error}`);
    setStep("fetching ciphertext and decrypting in your browser");
    const envJson = await fetchEnvelopeJson(c.payloadURI);
    setHashOk(hashEnvelopeJson(envJson) === c.payloadHash);
    setPkg(JSON.parse(await decryptPackage(parseEnvelope(envJson), j.key)));
  };

  return (
    <>
      <Panel>
        <Rule left="relevance preview" right="local only" />
        <p className="mt-2 text-[12px] text-muted-foreground">Your beat never leaves this browser. You see a count, not which entities matched.</p>
        <textarea className="mt-2 h-20 glass-input w-full resize-none rounded-xl p-3 text-[12px] outline-none" value={beat} onChange={(e) => setBeat(e.target.value)} />
        <div className="mt-2 text-[13px]">
          touches <span className="text-gold">{overlap}</span> of {beat.split(",").filter((s) => s.trim()).length} entities on your beat
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Bloom filter, not PSI: a determined buyer can probe it. See DESIGN.md.</p>
      </Panel>

      <Panel tone="gold">
        <Rule left="buy blind" right={usd(price)} />
        <div className="mt-3 space-y-1 text-[13px]">
          <div className="flex justify-between"><span className="text-gold-dim">upfront → seller now</span><span>{usd(BigInt(c.currentUpfront))}</span></div>
          <div className="flex justify-between"><span className="text-gold-dim">contingent → escrow</span><span>{usd(BigInt(c.contingent))}</span></div>
          <div className="flex justify-between"><span className="text-gold-dim">if false, you receive</span><span>{usd(BigInt(c.contingent))} + {usd(BigInt(c.bond) / 4n)}+ of bond</span></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!address ? (
            <span className="text-[12px] text-muted-foreground">Connect a wallet to buy, or use the agent API (x402).</span>
          ) : pkg ? null : c.status !== "OPEN" || expired ? (
            <Btn onClick={() => run(unlock)} disabled={!!step}>request key</Btn>
          ) : isSeller ? (
            <span className="text-[12px] text-muted-foreground">You are the seller of this claim.</span>
          ) : (
            <>
              <Btn variant="primary" onClick={buy} disabled={!!step}>purchase {usd(price)}</Btn>
              <Btn onClick={() => run(unlock)} disabled={!!step}>already bought</Btn>
            </>
          )}
        </div>
        {expired && !pkg && <p className="mt-2 text-[12px] text-gold">Exclusivity expired: anyone can request the key now. No purchase needed.</p>}
        {step && <p className="mt-3 text-[12px] text-gold-dim">{step}</p>}
        {txs.map(([l, h]) => <div key={h} className="mt-1 text-[12px]">{l} ✓ <TxLink hash={h} /></div>)}
        {err && <div className="mt-3 glass-danger rounded-2xl px-3 py-2 text-[12px]"><span className="font-medium text-danger">Error:</span> {err}</div>}
      </Panel>

      {pkg && (
        <Panel tone="gold">
          <Rule left="unsealed" right={hashOk ? "hash matches commit" : "HASH MISMATCH"} tone={hashOk ? "gold" : "danger"} />
          <p className="mt-3 text-[14px] leading-relaxed text-gold">{pkg.claim.teaser}</p>
          <div className="mt-2 text-[11px]">
            {rootOk ? <span className="text-gold">✓ all {pkg.items.length} items verify against the committed root</span> : <span className="text-danger">basket does not match itemsRoot</span>}
          </div>
          <ol className="mt-3 space-y-2">
            {pkg.items.map((it, i) => (
              <li key={i} className="rounded-2xl bg-white/[0.03] px-3 py-2 text-[12px]">
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
