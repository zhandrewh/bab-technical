// b@b UI primitives: soft panels, pill buttons and tags, gold accents on a dark ground.
import Link from "next/link";
import { EXPLORER } from "@/lib/chain";

export function Rule({ left, right, tone = "gold" }: { left: React.ReactNode; right?: React.ReactNode; tone?: "gold" | "dim" | "danger" }) {
  const c = tone === "gold" ? "text-foreground" : tone === "danger" ? "text-danger" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[15px] font-semibold first-letter:uppercase ${c}`}>{left}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      {right != null && <span className="text-[12px] text-muted-foreground">{right}</span>}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-gold inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold">
      {children}
    </div>
  );
}

export const btnBase = "glass-press inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium disabled:pointer-events-none disabled:opacity-40";
export const btnVariant = {
  primary: "glass-solid text-background",
  danger: "glass-danger text-danger",
  idle: "glass text-foreground/90 hover:text-gold",
} as const;

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btnVariant };
export function Btn({ variant = "idle", className = "", children, ...p }: BtnProps) {
  return (
    <button {...p} className={`${btnBase} ${btnVariant[variant]} ${className}`}>
      {children}
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
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border/40 py-2.5 text-[13px] last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <span className="label pt-0.5">{k}</span>
      <span className="min-w-0 break-words">
        {v}
        {hint && <span className="mt-0.5 block text-[12px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

export function Panel({ children, className = "", tone }: { children: React.ReactNode; className?: string; tone?: "danger" | "gold" }) {
  const t = tone === "danger" ? "glass-danger" : tone === "gold" ? "glass-gold" : "glass";
  return <div className={`rounded-3xl p-5 ${t} ${className}`}>{children}</div>;
}

export function Tag({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "gold" | "danger" }) {
  const t = tone === "gold" ? "glass-gold text-gold" : tone === "danger" ? "glass-danger text-danger" : "glass text-muted-foreground";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${t}`}>{children}</span>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-danger rounded-2xl px-4 py-2.5 text-[13px]">
      <span className="font-medium text-danger">Error: </span>
      {children}
    </div>
  );
}

export function Pending({ children }: { children: React.ReactNode }) {
  return <p className="live text-[12px] text-gold-dim">{children}</p>;
}

export const inputCls = "glass-input w-full rounded-xl px-3 py-2 text-[13px] outline-none";

export const brierText = (b: number | null) => (b == null ? "—" : b.toFixed(3));

export function outcomeTone(o: string): "gold" | "danger" | "dim" {
  return o === "TRUE" ? "gold" : o === "FALSE" || o === "FABRICATED" ? "danger" : "dim";
}
