"use client";
// Basket builder: rows of sealed FCA cases -> salted items -> itemsRoot. The "{k} of {n}" prefix is written by the
// contract, so the form shows it locked; the seller only writes the rest of the headline.
import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { stringToHex } from "viem";
import Link from "next/link";
import { marketAbi, erc20Abi } from "@/lib/abi";
import { MARKET, USDC, CUSTODIAN_PUBKEY, usd } from "@/lib/chain";
import { encryptPackage } from "@/lib/crypto";
import { buildBloom } from "@/lib/bloom";
import { commitBasket, randomSalt } from "@/lib/merkle";
import { basketEntities, validTerm } from "@/lib/fca";
import { binomTail, fmtOdds, sharpness, signalRate, suggestK } from "@/lib/odds";
import type { BasketItem, EvidencePackage } from "@/lib/package";
import { Btn, Panel, Rule, Stats, TxLink } from "./ui";

const input = "field w-full rounded px-3 py-2 text-[13px] outline-none";
type Row = { defendant: string; terms: string; court: string; docketId: string; docketNumber: string; entryDate: string; entryText: string; url: string };
const blank = (): Row => ({ defendant: "", terms: "", court: "", docketId: "", docketNumber: "", entryDate: "", entryText: "", url: "" });

function splitSignal(share: number) {
  if (share <= 0.15) return "Strong signal: you take almost nothing unless enough cases hit and the basket goes public.";
  if (share <= 0.35) return "Confident: most of your payout is contingent on at least k hitting.";
  if (share <= 0.6) return "Hedged: you are asking buyers to share the risk roughly evenly.";
  return "Weak signal: you want paid now regardless. Expect buyers to discount this listing.";
}

export function CommitForm() {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [kPick, setKPick] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [body, setBody] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [domain, setDomain] = useState("fca:federal");
  const [total, setTotal] = useState(1.78);
  const [share, setShare] = useState(0.1);
  const [bondMult, setBondMult] = useState(7);
  const [exclDays, setExclDays] = useState(14);
  const [attest, setAttest] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; tx: string } | null>(null);

  const filled = rows.filter((r) => r.defendant.trim() && r.docketId.trim());
  const n = filled.length;
  const pSignal = signalRate(days);
  const suggested = n ? suggestK(n, pSignal, 0.6) : 1;
  const k = Math.min(Math.max(1, kPick ?? suggested), Math.max(1, n));
  const confidence = n ? binomTail(n, k, pSignal) : 0;
  const s = sharpness(Math.max(n, 1), k, days);
  const deadlineMs = Date.now() + days * 86400e3;
  const deadlineLabel = new Date(deadlineMs).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const teaserBody = body || `sealed federal fraud cases will produce a DOJ settlement release by ${deadlineLabel}`;

  const upfront = BigInt(Math.round(total * share * 1e6));
  const contingent = BigInt(Math.round(total * 1e6)) - upfront;
  const bond = BigInt(Math.round(Number(upfront) * bondMult));
  const exclEnd = Date.now() + exclDays * 86400e3;
  const willAutoRelease = exclEnd <= deadlineMs;
  const badTerms = useMemo(() => filled.flatMap((r) => r.terms.split(",").map((t) => t.trim()).filter((t) => t && !validTerm(t))), [filled]);

  const set = (i: number, key: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  const submit = async () => {
    setErr("");
    try {
      if (n < 1) throw new Error("add at least one case (defendant and CourtListener docket id)");
      if (!attest) throw new Error("the attestation is required");
      const items: BasketItem[] = filled.map((r) => ({
        defendant: r.defendant.trim(),
        matchTerms: r.terms.split(",").map((t) => t.trim()).filter(validTerm),
        court: r.court.trim(),
        docketId: Number(r.docketId),
        docketNumber: r.docketNumber.trim(),
        entryDate: r.entryDate,
        entryText: r.entryText.trim(),
        courtlistenerURL: r.url.trim() || `https://www.courtlistener.com/docket/${r.docketId.trim()}/`,
        salt: randomSalt(),
      }));
      if (items.some((it) => !it.matchTerms.length)) throw new Error("every case needs at least one valid match term (6+ letters, not generic)");
      const pkg: EvidencePackage = {
        version: 2,
        claim: { teaser: `${k} of ${n} ${teaserBody}`, teaserBody, n, k, resolver: "DOJ_FCA", deadline: new Date(deadlineMs).toISOString() },
        items,
        entities: basketEntities(items),
        sources: items.map((it) => ({ title: `${it.defendant} · ${it.docketNumber}`, url: it.courtlistenerURL, retrievedAt: new Date().toISOString() })),
        analysis,
        seller: { agent: "verity-web", version: "0.2.0" },
      };
      const { root } = commitBasket(items);
      setStep("encrypting the basket in your browser (AES-256-GCM)");
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
        n,
        k,
        itemsRoot: root,
        teaserBody,
        payloadHash,
        resolverId: stringToHex("DOJ_FCA", { size: 32 }),
        deadline: BigInt(Math.floor(deadlineMs / 1000)),
        exclusivitySeconds: BigInt(Math.round(exclDays * 86400)),
        upfront,
        contingent,
        bond,
        confidenceBps: Math.round(confidence * 10_000),
        domain: stringToHex(domain.slice(0, 31), { size: 32 }),
        attestation,
        payloadURI: st.uri,
        bloom: buildBloom(pkg.entities),
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
        <Rule left={`basket #${done.id} committed`} right={<TxLink hash={done.tx} />} />
        <p className="mt-3 text-[13px]">The record is permanent: you named these cases, now. Your basket opens to everyone on {new Date(exclEnd).toUTCString()}.</p>
        <Link href={`/claim/${done.id}`} className="mt-3 inline-block text-[13px] font-medium text-gold hover:underline">View listing →</Link>
      </Panel>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <Panel>
          <Rule left="1 · the basket" right={`${n} sealed · salted · merklized`} />
          <p className="mt-2 text-[12px] text-muted-foreground">
            One row per sealed False Claims Act case, cited to a CourtListener docket entry. A fake citation is fabrication: 100% of your bond.
            Match terms must name the defendant (6+ letters, not a sector or place).
          </p>
          <div className="mt-3 divide-y divide-border border-y border-border">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 py-3 sm:grid-cols-6">
                <input className={`${input} sm:col-span-3`} placeholder="Defendant, e.g. Lockheed Martin Corporation" value={r.defendant} onChange={(e) => set(i, "defendant", e.target.value)} />
                <input className={`${input} sm:col-span-3`} placeholder="Match terms, e.g. Lockheed" value={r.terms} onChange={(e) => set(i, "terms", e.target.value)} />
                <input className={`${input} sm:col-span-2`} placeholder="Court" value={r.court} onChange={(e) => set(i, "court", e.target.value)} />
                <input className={input} placeholder="Docket id" value={r.docketId} onChange={(e) => set(i, "docketId", e.target.value)} />
                <input className={input} placeholder="1:24-cv-00148" value={r.docketNumber} onChange={(e) => set(i, "docketNumber", e.target.value)} />
                <input type="date" className={`${input} sm:col-span-2`} value={r.entryDate} onChange={(e) => set(i, "entryDate", e.target.value)} />
                <input className={`${input} sm:col-span-4`} placeholder="Cited entry text (notice of election to intervene for purposes of settlement…)" value={r.entryText} onChange={(e) => set(i, "entryText", e.target.value)} />
                <input className={`${input} sm:col-span-2`} placeholder="CourtListener URL" value={r.url} onChange={(e) => set(i, "url", e.target.value)} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Btn onClick={() => setRows((rs) => [...rs, blank()])} disabled={rows.length >= 64}>+ add case</Btn>
            {rows.length > 1 && <Btn onClick={() => setRows((rs) => rs.slice(0, -1))}>remove last</Btn>}
          </div>
          {badTerms.length > 0 && <p className="mt-2 text-[12px] text-danger">Ignored as too generic: {badTerms.join(", ")}</p>}
        </Panel>

        <Panel>
          <Rule left="2 · the public claim" right="resolves via justice.gov" />
          <label className="mt-3 grid gap-1">
            <span className="label">claim · at least k of {n || "n"}</span>
            <input type="range" min={1} max={Math.max(1, n)} value={k} onChange={(e) => setKPick(Number(e.target.value))} />
          </label>
          <div className="mt-2 flex items-stretch overflow-hidden rounded">
            <span className="surface-gold flex items-center px-3 text-[13px] font-semibold text-gold" title="Written by the contract">
              🔒 {k} of {n || "n"}
            </span>
            <input className={`${input} rounded-l-none`} placeholder={teaserBody} value={body} maxLength={240} onChange={(e) => setBody(e.target.value)} />
          </div>
          <label className="mt-3 grid gap-1">
            <span className="label">deadline · {days} days ({deadlineLabel})</span>
            <input type="range" min={7} max={120} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <div className="mt-4">
            <Stats
              big
              cols="grid-cols-3"
              items={[
                ["Expected by chance", s.expected.toFixed(1)],
                ["Random-basket odds", fmtOdds(s.randomOdds)],
                ["At the signal rate", fmtOdds(confidence)],
              ]}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Suggested k = {suggested}: the largest k with at least 60% odds at the backtested {(pSignal * 100).toFixed(1)}% per-item rate. Your stated confidence is
            that probability; it feeds your Brier score.
          </p>
        </Panel>

        <Panel>
          <Rule left="3 · analysis" right="encrypted before upload" />
          <textarea className={`${input} mt-3 h-28`} placeholder="Why these cases. Cite the records." value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
          <label className="mt-3 grid gap-1">
            <span className="label">domain tag</span>
            <input className={input} value={domain} onChange={(e) => setDomain(e.target.value)} />
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">Match terms and courts are published as a Bloom filter. Buyers learn how many of their watchlist names overlap, not which.</p>
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
          <p className="mt-1 text-[11px] text-muted-foreground">Fewer than {k} hit: you lose {usd(bond / 2n)}. Fabricated citation: you lose all {usd(bond)}.</p>
        </Panel>

        <Panel>
          <Rule left="5 · exclusivity" right="fixed now" />
          <label className="mt-3 grid gap-1">
            <span className="label">{exclDays} days · opens {new Date(exclEnd).toISOString().slice(0, 10)}</span>
            <input type="range" min={0.01} max={90} step={0.01} value={exclDays} onChange={(e) => setExclDays(Number(e.target.value))} />
          </label>
          <p className={`mt-2 text-[12px] ${willAutoRelease ? "text-gold" : "text-danger"}`}>
            {willAutoRelease
              ? "Opens before the deadline: publication is guaranteed, so a true basket pays your contingent."
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
          {step && <p className="live mt-3 text-[12px] text-gold-dim">{step}</p>}
          {err && <div className="mt-3 surface-danger rounded px-3 py-2 text-[12px]"><span className="font-medium text-danger">Error:</span> {err}</div>}
        </Panel>
      </div>
    </div>
  );
}
