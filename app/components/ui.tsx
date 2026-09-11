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
    <div className="surface-gold inline-flex items-center gap-2 rounded px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold">
      {children}
    </div>
  );
}

export const btnBase = "glass-press inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-[13px] font-medium disabled:pointer-events-none disabled:opacity-40";
export const btnVariant = {
  primary: "fill-gold text-background",
  danger: "surface-danger text-danger",
  idle: "surface text-foreground/90 hover:text-gold",
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

/** raised: the one surface on a page that carries the action (buying). Use it once. */
export function Panel({ children, className = "", tone }: { children: React.ReactNode; className?: string; tone?: "danger" | "gold" | "raised" }) {
  const t = tone === "danger" ? "surface-danger" : tone === "gold" ? "surface-gold" : tone === "raised" ? "surface-raised" : "surface";
  return <div className={`rounded-md p-5 ${t} ${className}`}>{children}</div>;
}

/** Figures set as a row of labelled columns divided by hairlines, instead of a box per number. */
export function Stats({ items, cols = "grid-cols-2 sm:grid-cols-4", big }: { items: [React.ReactNode, React.ReactNode, React.ReactNode?][]; cols?: string; big?: boolean }) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${cols}`}>
      {items.map(([k, v, hint], i) => (
        <div key={i} className="min-w-0 border-l border-border pl-3">
          <dt className="text-[11px] text-muted-foreground">{k}</dt>
          <dd className={`mt-0.5 truncate tabular-nums text-foreground ${big ? "text-[18px] font-semibold" : "text-[13px]"}`}>{v}</dd>
          {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Tag({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "gold" | "danger" }) {
  const t = tone === "gold" ? "surface-gold text-gold" : tone === "danger" ? "surface-danger text-danger" : "surface text-muted-foreground";
  return <span className={`inline-block rounded px-2.5 py-0.5 text-[11px] font-medium capitalize ${t}`}>{children}</span>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface-danger rounded px-4 py-2.5 text-[13px]">
      <span className="font-medium text-danger">Error: </span>
      {children}
    </div>
  );
}

export function Pending({ children }: { children: React.ReactNode }) {
  return <p className="live text-[12px] text-gold-dim">{children}</p>;
}

export const inputCls = "field w-full rounded px-3 py-2 text-[13px] outline-none";

export const brierText = (b: number | null) => (b == null ? "—" : b.toFixed(3));

export function outcomeTone(o: string): "gold" | "danger" | "dim" {
  return o === "TRUE" ? "gold" : o === "FALSE" || o === "FABRICATED" ? "danger" : "dim";
}
