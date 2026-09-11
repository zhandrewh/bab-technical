"use client";
// Receipt popup: every write the UI makes ends here, with the Basescan link for each transaction it produced.
import Link from "next/link";
import { useEffect } from "react";
import { EXPLORER } from "@/lib/chain";
import { Btn, Rule } from "./ui";

export type TxReceipt = { label: string; hash: string; note?: string };

export function TxModal({ title, summary, txs, onClose }: { title: string; summary?: React.ReactNode; txs: TxReceipt[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="surface-raised w-full max-w-lg rounded-md p-6" onClick={(e) => e.stopPropagation()}>
        <Rule left={title} right="base sepolia · confirmed" />
        {summary && <div className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{summary}</div>}
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {txs.map((t) => (
            <li key={t.hash} className="py-3 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-foreground">✓ {t.label}</span>
                <a href={`${EXPLORER}/tx/${t.hash}`} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold-faint underline-offset-2 hover:decoration-gold">
                  view on Basescan ↗
                </a>
              </div>
              <code className="mt-1 block break-all text-[11px] text-muted-foreground">{t.hash}</code>
              {t.note && <div className="mt-1 text-[11px] text-muted-foreground">{t.note}</div>}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/ledger" className="glass-press fill-gold inline-flex items-center rounded px-4 py-2 text-[13px] font-medium text-background">
            open the ledger
          </Link>
          <Btn onClick={onClose}>close</Btn>
        </div>
      </div>
    </div>
  );
}
