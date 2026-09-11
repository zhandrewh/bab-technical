// b@b terminal primitives: text-built UI, 1px CSS rules, bracketed buttons, no icons.
import Link from "next/link";
import { EXPLORER } from "@/lib/chain";

export function Rule({ left, right, tone = "gold" }: { left: React.ReactNode; right?: React.ReactNode; tone?: "gold" | "dim" | "danger" }) {
  const c = tone === "gold" ? "text-gold" : tone === "danger" ? "text-danger" : "text-gold-dim";
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[11px] uppercase tracking-widest ${c}`}>{left}</span>
      <span className="h-px flex-1 bg-border" />
      {right != null && <span className="text-[10px] uppercase tracking-widest text-gold-dim">{right}</span>}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.35em] text-gold-dim">
      <span className="h-px w-10 bg-gold-faint sm:w-16" />
      {children}
      <span className="h-px w-10 bg-gold-faint sm:w-16" />
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "idle" | "primary" | "danger" };
export function Btn({ variant = "idle", className = "", children, ...p }: BtnProps) {
  const v =
    variant === "primary"
      ? "border-gold-dim text-gold hover:bg-gold hover:text-background"
      : variant === "danger"
        ? "border-danger/50 text-danger hover:bg-danger hover:text-background"
        : "border-border text-gold-dim hover:border-gold hover:text-gold";
  return (
    <button {...p} className={`border px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors disabled:pointer-events-none disabled:opacity-40 ${v} ${className}`}>
      [ {children} ]
    </button>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" className="text-gold-dim underline decoration-gold-faint underline-offset-2 transition-colors hover:text-gold hover:decoration-gold-dim">
      {label ?? `${hash.slice(0, 8)}…${hash.slice(-4)}`} ↗
    </a>
  );
}

export function Addr({ a, link = true }: { a: string; link?: boolean }) {
  const s = `${a.slice(0, 6)}…${a.slice(-4)}`;
  if (!link) return <span>{s}</span>;
  return (
    <Link href={`/seller/${a}`} className="text-foreground/90 underline decoration-gold-faint underline-offset-2 hover:text-gold">
      {s}
    </Link>
  );
}

export function Field({ k, v, hint }: { k: React.ReactNode; v: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border/40 py-2 text-[13px] sm:grid-cols-[12rem_1fr]">
      <span className="label pt-0.5">{k}</span>
      <span className="min-w-0 break-words">
        {v}
        {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

export function Panel({ children, className = "", tone }: { children: React.ReactNode; className?: string; tone?: "danger" | "gold" }) {
  const t = tone === "danger" ? "border-danger/50 bg-danger/5" : tone === "gold" ? "border-gold-dim/60 bg-surface/80" : "border-border bg-surface/80";
  return <div className={`rounded-sm border p-4 backdrop-blur-sm ${t} ${className}`}>{children}</div>;
}

export function Tag({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "gold" | "danger" }) {
  const t = tone === "gold" ? "border-gold-dim text-gold" : tone === "danger" ? "border-danger/50 text-danger" : "border-border text-gold-dim";
  return <span className={`inline-block border px-1.5 py-px text-[10px] uppercase tracking-widest ${t}`}>{children}</span>;
}

export const brierText = (b: number | null) => (b == null ? "—" : b.toFixed(3));

export function outcomeTone(o: string): "gold" | "danger" | "dim" {
  return o === "TRUE" ? "gold" : o === "FALSE" || o === "FABRICATED" ? "danger" : "dim";
}
