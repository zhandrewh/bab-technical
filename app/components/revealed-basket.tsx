"use client";
// The revealed basket after resolution. Every leaf and every revealed item is re-checked here, in the browser, against
// the itemsRoot the seller committed on chain — the oracle's evidence is not taken on trust.
import { useMemo } from "react";
import type { BasketEvidence } from "@/lib/package";
import { itemHash, itemLeaf, verifyProof } from "@/lib/merkle";
import { Panel, Rule, Tag } from "./ui";

export function RevealedBasket({ evidence: ev, itemsRoot, k, n }: { evidence: BasketEvidence; itemsRoot: string; k: number; n: number }) {
  const checks = useMemo(
    () =>
      ev.items.map((x) => ({
        proof: verifyProof(x.leaf, x.proof, itemsRoot as `0x${string}`),
        item: x.item ? itemLeaf(x.index, itemHash(x.item)).toLowerCase() === x.leaf.toLowerCase() : null,
      })),
    [ev, itemsRoot],
  );
  const allOk = ev.items.length === n && checks.every((c) => c.proof && c.item !== false);

  if (ev.outcome === "FABRICATED")
    return (
      <Panel tone="danger">
        <Rule left="basket fabricated" tone="danger" right={ev.checkedAt.slice(0, 10)} />
        <p className="mt-3 text-[13px]">{ev.note}</p>
      </Panel>
    );

  return (
    <Panel tone={ev.hits >= k ? "gold" : "danger"}>
      <Rule left={`revealed basket · ${ev.hits} of ${n} hit`} right={allOk ? <Tag tone="gold">✓ verified against root</Tag> : <Tag tone="danger">root check failed</Tag>} />
      <p className="mt-2 text-[12px] text-muted-foreground">
        Claim: at least {k}. {ev.note}. Checked {ev.checkedAt.replace("T", " ").slice(0, 16)} UTC. Leaves and proofs recomputed in your browser.
      </p>
      <div className="bab-scroll mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Defendant</th>
              <th className="py-2 pr-3 font-medium">Docket entry</th>
              <th className="py-2 pr-3 font-medium">DOJ release</th>
              <th className="py-2 font-medium">Root</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {ev.items.map((x, i) => (
              <tr key={x.index}>
                <td className="py-2 pr-3 text-muted-foreground">{x.index + 1}</td>
                <td className="py-2 pr-3">{x.item ? x.item.defendant : <span className="text-muted-foreground">sealed until exclusivity ends</span>}</td>
                <td className="py-2 pr-3">
                  {x.item ? (
                    <a href={x.item.courtlistenerURL} target="_blank" rel="noreferrer" className="text-gold-dim underline decoration-gold-faint hover:text-gold">
                      {x.item.docketNumber} · {x.item.entryDate} ↗
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-3">
                  {x.hit ? (
                    <a href={x.releaseURL} target="_blank" rel="noreferrer" className="text-gold hover:underline" title={x.releaseTitle}>
                      ✓ {x.releaseDate} ↗
                    </a>
                  ) : (
                    <span className="text-muted-foreground">✗ none</span>
                  )}
                </td>
                <td className={`py-2 text-[12px] ${checks[i].proof && checks[i].item !== false ? "text-gold" : "text-danger"}`}>
                  {checks[i].proof && checks[i].item !== false ? "✓" : "✗"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
