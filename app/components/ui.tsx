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
    <div className="inline-flex items-center gap-2 rounded-full border border-gold-faint bg-gold/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold">
      {children}
    </div>
  );
}

export const btnBase = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";
export const btnVariant = {
  primary: "bg-gold text-background hover:bg-gold/85",
  danger: "border border-danger/50 text-danger hover:bg-danger hover:text-background",
  idle: "border border-border bg-surface/60 text-foreground/85 hover:border-gold-dim hover:text-gold",
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
  const t = tone === "danger" ? "border-danger/40 bg-danger/5" : tone === "gold" ? "border-gold-faint bg-gradient-to-b from-gold/[0.06] to-surface/80" : "border-border/70 bg-surface/75";
  return <div className={`rounded-2xl border p-5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${t} ${className}`}>{children}</div>;
}

export function Tag({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "gold" | "danger" }) {
  const t = tone === "gold" ? "bg-gold/10 text-gold ring-gold-dim/50" : tone === "danger" ? "bg-danger/10 text-danger ring-danger/40" : "bg-secondary text-muted-foreground ring-border";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${t}`}>{children}</span>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-[13px]">
      <span className="font-medium text-danger">Error: </span>
      {children}
    </div>
  );
}

export function Pending({ children }: { children: React.ReactNode }) {
  return <p className="live text-[12px] text-gold-dim">{children}</p>;
}

export const inputCls = "w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-[13px] outline-none transition-colors focus:border-gold-dim focus:ring-2 focus:ring-gold/15";

export const brierText = (b: number | null) => (b == null ? "—" : b.toFixed(3));

export function outcomeTone(o: string): "gold" | "danger" | "dim" {
  return o === "TRUE" ? "gold" : o === "FALSE" || o === "FABRICATED" ? "danger" : "dim";
}
