"use client";
import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { stringToHex } from "viem";
import { marketAbi, erc20Abi } from "@/lib/abi";
import { MARKET, USDC, CUSTODIAN_PUBKEY, usd } from "@/lib/chain";
import { encryptPackage, hashText } from "@/lib/crypto";
import { buildBloom, normalizeEntity } from "@/lib/bloom";
import type { EvidencePackage, ResolverId } from "@/lib/package";
import { Btn, Panel, Rule, TxLink } from "./ui";
import Link from "next/link";

const input = "w-full border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-gold-dim";
const RES: Record<ResolverId, { label: string; query: string; hint: string }> = {
  FEDREG: { label: "Federal Register", query: "FR document number, e.g. 2026-18583", hint: "Resolves TRUE when the document is published by the deadline. No key needed." },
  SAM: { label: "SAM.gov exclusions", query: "Contractor UEI", hint: "Resolves TRUE on an active exclusion/debarment record." },
  COURTLISTENER: { label: "CourtListener / RECAP", query: "docket id | regex pattern", hint: "Resolves TRUE on a matching docket entry." },
};

function splitSignal(share: number) {
  if (share <= 0.15) return "Strong signal: you take almost nothing unless you are right and it goes public. Buyers read this as high confidence.";
  if (share <= 0.35) return "Confident: most of your payout is contingent on the claim resolving true and public.";
  if (share <= 0.6) return "Hedged: you are asking buyers to share the risk roughly evenly.";
  return "Weak signal: you want paid now regardless. Expect buyers to discount this listing.";
}

export function CommitForm() {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [resolver, setResolver] = useState<ResolverId>("FEDREG");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 16));
  const [evidence, setEvidence] = useState("");
  const [files, setFiles] = useState<{ name: string; b64: string }[]>([]);
  const [entities, setEntities] = useState("");
  const [domain, setDomain] = useState("fedreg:");
  const [total, setTotal] = useState(1.78);
  const [share, setShare] = useState(0.1);
  const [bondMult, setBondMult] = useState(7);
  const [exclDays, setExclDays] = useState(30);
  const [confidence, setConfidence] = useState(80);
  const [attest, setAttest] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; tx: string } | null>(null);

  const upfront = BigInt(Math.round(total * share * 1e6));
  const contingent = BigInt(Math.round(total * 1e6)) - upfront;
  const bond = BigInt(Math.round(Number(upfront) * bondMult));
  const exclEnd = Date.now() + exclDays * 86400e3;
  const deadlineMs = new Date(deadline).getTime();
  const willAutoRelease = exclEnd <= deadlineMs;
  const entityList = useMemo(() => entities.split(",").map((s) => s.trim()).filter(Boolean).map(normalizeEntity), [entities]);

  const submit = async () => {
    setErr("");
    try {
      if (!text || !query) throw new Error("claim text and resolver query are required");
      if (!attest) throw new Error("the attestation is required");
      const q = resolver === "FEDREG" ? { kind: "fedreg.published" as const, documentNumber: query.trim() }
        : resolver === "SAM" ? { kind: "sam.exclusion" as const, uei: query.trim() }
        : { kind: "courtlistener.docket" as const, docketId: query.split("|")[0].trim(), pattern: (query.split("|")[1] ?? "").trim() };
      const pkg: EvidencePackage = {
        version: 1,
        claim: { text, resolver, query: q, deadline: new Date(deadline).toISOString() },
        entities: entityList,
        sources: files.map((f) => ({ title: f.name, url: `data:application/octet-stream;base64,${f.b64}`, retrievedAt: new Date().toISOString() })),
        analysis: evidence,
        seller: { agent: "verity-web", version: "0.1.0" },
      };
      setStep("encrypting evidence in your browser (AES-256-GCM)");
      const { envelopeJson, payloadHash } = await encryptPackage(JSON.stringify(pkg), CUSTODIAN_PUBKEY);
      setStep("storing ciphertext");
      const st = await (await fetch("/api/payload", { method: "POST", body: envelopeJson })).json();
      if (!st.uri) throw new Error(st.error ?? "storage failed");
      const allowance = await pc!.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [address!, MARKET] });
      if (allowance < bond) {
        setStep(`approve ${usd(bond)} bond in your wallet`);
        const h = await writeContractAsync({ address: USDC, abi: erc20Abi, functionName: "approve", args: [MARKET, bond] });
        setStep("waiting for approval to confirm on base sepolia");
        await pc!.waitForTransactionReceipt({ hash: h });
      }
      const attestation = await pc!.readContract({ address: MARKET, abi: marketAbi, functionName: "ATTESTATION" });
      const params = {
        claimHash: hashText(text),
        payloadHash,
        resolverId: stringToHex(resolver, { size: 32 }),
        deadline: BigInt(Math.floor(deadlineMs / 1000)),
        exclusivitySeconds: BigInt(Math.round(exclDays * 86400)),
        upfront,
        contingent,
        bond,
        confidenceBps: confidence * 100,
        domain: stringToHex(domain.slice(0, 31), { size: 32 }),
        attestation,
        payloadURI: st.uri,
        bloom: buildBloom(entityList),
      };
      const { result } = await pc!.simulateContract({ account: address, address: MARKET, abi: marketAbi, functionName: "commit", args: [params] });
      setStep("confirm the commit in your wallet — your bond transfers in");
      const tx = await writeContractAsync({ address: MARKET, abi: marketAbi, functionName: "commit", args: [params] });
      setStep("waiting for commit to confirm on base sepolia");
      await pc!.waitForTransactionReceipt({ hash: tx });
      setDone({ id: result.toString(), tx });
    } catch (e) {
      setErr((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setStep("");
    }
  };

  if (done)
    return (
      <Panel tone="gold">
        <Rule left={`claim #${done.id} committed`} right={<TxLink hash={done.tx} />} />
        <p className="mt-3 text-[13px]">The record is permanent: you knew this, now. Your package opens to everyone on {new Date(exclEnd).toUTCString()}.</p>
        <Link href={`/claim/${done.id}`} className="mt-3 inline-block text-[11px] uppercase tracking-widest text-gold hover:underline">[ view listing ]</Link>
      </Panel>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <Panel>
          <Rule left="1 · the claim" right="sealed" />
          <textarea className={`${input} mt-3 h-24`} placeholder="Contractor X's program will appear in a DoD IG report, DOJ settlement, or SAM.gov debarment…" value={text} onChange={(e) => setText(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">Only keccak256(text) goes on chain. Name, in advance, the institution that could prove you wrong.</p>
        </Panel>

        <Panel>
          <Rule left="2 · resolver" right="whitelist" />
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(RES) as ResolverId[]).map((r) => (
              <button key={r} onClick={() => setResolver(r)} className={`border px-2 py-1 text-[11px] uppercase tracking-widest transition-colors ${resolver === r ? "border-gold text-gold" : "border-border text-gold-dim hover:text-gold"}`}>
                {RES[r].label}
              </button>
            ))}
          </div>
          <input className={`${input} mt-3`} placeholder={RES[resolver].query} value={query} onChange={(e) => setQuery(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">{RES[resolver].hint} Claims resolvable by the buyer&apos;s own publication are not accepted.</p>
          <label className="mt-3 grid gap-1">
            <span className="label">deadline</span>
            <input type="datetime-local" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </Panel>

        <Panel>
          <Rule left="3 · evidence" right="encrypted before upload" />
          <textarea className={`${input} mt-3 h-32`} placeholder="Your analysis and evidence trail. Cite the records." value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <input
            type="file"
            multiple
            className="mt-2 text-[12px] text-gold-dim file:mr-3 file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-[11px] file:uppercase file:tracking-widest file:text-gold-dim"
            onChange={async (e) => {
              const out: { name: string; b64: string }[] = [];
              for (const f of Array.from(e.target.files ?? [])) {
                const u = new Uint8Array(await f.arrayBuffer());
                let s = "";
                for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
                out.push({ name: f.name, b64: btoa(s) });
              }
              setFiles(out);
            }}
          />
          <label className="mt-3 grid gap-1">
            <span className="label">entities (for the relevance preview)</span>
            <input className={input} placeholder="agency:defense-department, cage:1abc2, fips:06075" value={entities} onChange={(e) => setEntities(e.target.value)} />
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">Published as a Bloom filter. Buyers learn how many of their entities overlap, not which.</p>
          <label className="mt-3 grid gap-1">
            <span className="label">domain tag</span>
            <input className={input} value={domain} onChange={(e) => setDomain(e.target.value)} />
          </label>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel tone="gold">
          <Rule left="4 · price & signal" />
          <label className="mt-3 grid gap-1">
            <span className="label">total ask (usdc)</span>
            <input type="number" step="0.01" min="0.01" className={input} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
          </label>
          <label className="mt-3 grid gap-1">
            <span className="label">upfront share · {Math.round(share * 100)}%</span>
            <input type="range" min={0.05} max={1} step={0.05} value={share} onChange={(e) => setShare(Number(e.target.value))} />
          </label>
          <div className="mt-1 text-[13px]">{usd(upfront)} upfront + {usd(contingent)} contingent</div>
          <p className="mt-2 text-[12px] leading-relaxed text-gold">{splitSignal(share)}</p>

          <label className="mt-4 grid gap-1">
            <span className="label">bond · {bondMult}× upfront</span>
            <input type="range" min={1} max={20} step={1} value={bondMult} onChange={(e) => setBondMult(Number(e.target.value))} />
          </label>
          <div className="mt-1 text-[13px]">{usd(bond)} staked</div>
          <p className="mt-1 text-[11px] text-muted-foreground">If false you lose {usd(bond / 2n)}. If fabricated you lose all {usd(bond)}.</p>

          <label className="mt-4 grid gap-1">
            <span className="label">your confidence · {confidence}%</span>
            <input type="range" min={50} max={99} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">Scored against the outcome. This is your Brier record.</p>
        </Panel>

        <Panel>
          <Rule left="5 · exclusivity" right="fixed now" />
          <label className="mt-3 grid gap-1">
            <span className="label">{exclDays} days · opens {new Date(exclEnd).toISOString().slice(0, 10)}</span>
            <input type="range" min={0.01} max={90} step={0.01} value={exclDays} onChange={(e) => setExclDays(Number(e.target.value))} />
          </label>
          <p className={`mt-2 text-[12px] ${willAutoRelease ? "text-gold" : "text-danger"}`}>
            {willAutoRelease
              ? "Opens before the deadline: publication is guaranteed, so a true claim pays your contingent."
              : "Opens after the deadline: if the buyer sits on it, your contingent goes to the public-goods pool, not to you and not back to them."}
          </p>
        </Panel>

        <Panel>
          <label className="flex items-start gap-2 text-[12px] leading-relaxed">
            <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
            <span>I attest this evidence derives solely from lawfully obtained public records. No classified material. No material non-public information.</span>
          </label>
          <div className="mt-4">
            {address ? <Btn variant="primary" onClick={submit} disabled={!!step}>seal & commit · bond {usd(bond)}</Btn> : <span className="text-[12px] text-muted-foreground">Connect a wallet to commit.</span>}
          </div>
          {step && <p className="caret mt-3 text-[11px] uppercase tracking-widest text-gold-dim">{step}</p>}
          {err && <div className="mt-3 rounded-sm border border-danger/50 bg-danger/5 p-2 text-[12px]"><span className="text-danger">[error]</span> {err}</div>}
        </Panel>
      </div>
    </div>
  );
}
