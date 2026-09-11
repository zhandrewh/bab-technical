"use client";
// The ledger as a git graph. One trunk (the contract), one lane per claim: it branches at commit, carries every
// purchase, publication, proposal and dispute, and merges back at settlement. Rows are fixed height so a single SVG
// draws the whole graph; the selected row opens in a side panel instead of expanding in place.
import Link from "next/link";
import { useMemo, useState } from "react";
import { LENSES, type LaneSpan, type LedgerNode, type Lens, type Tone } from "@/lib/ledger";
import { EXPLORER } from "@/lib/chain";
import { Addr, Tag, TxLink } from "./ui";

const H = 56; // row height
const LW = 20; // lane spacing
const PAD = 12;
const COLOR: Record<Tone, string> = { gold: "var(--gold)", dim: "var(--gold-dim)", danger: "var(--danger)", fg: "var(--foreground)" };
const x = (lane: number) => PAD + lane * LW;
const y = (row: number) => row * H + H / 2;
const when = (ts: number) => new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

function spanPath(s: LaneSpan): string {
  const xl = x(s.lane), x0 = x(0);
  let d = `M ${x0} ${y(s.to) + H / 2} C ${x0} ${y(s.to)}, ${xl} ${y(s.to) + H / 2}, ${xl} ${y(s.to)}`; // branch off below the commit row
  d += ` L ${xl} ${y(s.from)}`;
  if (s.merged) d += ` C ${xl} ${y(s.from) - H / 2}, ${x0} ${y(s.from)}, ${x0} ${y(s.from) - H / 2}`; // merge back above the settle row
  else d += ` L ${xl} ${y(s.from) - H / 2}`;
  return d;
}

function Node({ n, row, muted }: { n: LedgerNode; row: number; muted: boolean }) {
  const c = COLOR[n.tone];
  const cx = x(n.lane), cy = y(row);
  const filled = n.kind === "Settled" || n.kind === "Slashed" || n.kind === "Purchased" || n.kind === "BidFilled";
  return (
    <g opacity={muted ? 0.25 : 1} style={{ transition: "opacity .25s" }}>
      {n.derived ? (
        <circle cx={cx} cy={cy} r={4.5} fill="var(--background)" stroke={c} strokeWidth={1.5} strokeDasharray="2 2" />
      ) : (
        <circle cx={cx} cy={cy} r={filled ? 5 : 4.5} fill={filled ? c : "var(--background)"} stroke={c} strokeWidth={filled ? 0 : 2} />
      )}
      {n.merges && <circle cx={cx} cy={cy} r={8} fill="none" stroke={c} strokeWidth={1} opacity={0.5} />}
    </g>
  );
}

export function LedgerGraph({ rows, spans, lanes }: { rows: LedgerNode[]; spans: LaneSpan[]; lanes: number }) {
  const [lens, setLens] = useState<Lens | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(rows[0]?.key ?? null);
  const selected = rows.find((r) => r.key === sel) ?? null;
  const width = PAD * 2 + Math.max(lanes - 1, 0) * LW;
  const height = rows.length * H;
  const visible = (n: LedgerNode) => (!lens || n.lenses.includes(lens)) && (!focus || n.claimId === focus || (n.lane === 0 && n.claimId == null));
  const counts = useMemo(() => Object.fromEntries(LENSES.map((l) => [l.id, rows.filter((r) => r.lenses.includes(l.id)).length])), [rows]);
  const activeLens = LENSES.find((l) => l.id === lens);

  if (!rows.length)
    return <div className="surface rounded-md px-6 py-10 text-center text-[13px] text-muted-foreground">No transactions indexed yet. The first commit appears here within one block.</div>;

  return (
    <div className="space-y-4">
      {/* Lenses: what the reviewer is grading. Selecting one dims every node that is not evidence for it. */}
      <div className="flex flex-wrap gap-2">
        {LENSES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLens(lens === l.id ? null : l.id)}
            className={`glass-press rounded px-3.5 py-1.5 text-[13px] font-medium ${lens === l.id ? "fill-gold text-background" : "surface text-muted-foreground hover:text-foreground"}`}
          >
            {l.label} <span className={lens === l.id ? "opacity-70" : "text-gold-dim"}>{counts[l.id]}</span>
          </button>
        ))}
        {(lens || focus) && (
          <button onClick={() => (setLens(null), setFocus(null))} className="rounded px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground">
            clear
          </button>
        )}
      </div>
      {activeLens && (
        <div className="surface-gold rounded px-4 py-3 text-[13px] leading-relaxed">
          <div className="font-medium text-gold">{activeLens.question}</div>
          <p className="mt-1 text-foreground/85">{activeLens.proof}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
        <div className="surface overflow-hidden rounded-md">
          <div className="grid grid-cols-[auto_1fr]">
            <svg width={width} height={height} className="shrink-0 select-none" aria-hidden>
              <line x1={x(0)} x2={x(0)} y1={0} y2={height} stroke="var(--gold-faint)" strokeWidth={2} />
              {spans.map((s) => (
                <path
                  key={`${s.claimId}:${s.to}`}
                  d={spanPath(s)}
                  fill="none"
                  stroke={COLOR[s.tone]}
                  strokeWidth={1.5}
                  opacity={focus && focus !== s.claimId ? 0.15 : lens ? 0.45 : 0.7}
                  style={{ transition: "opacity .25s" }}
                />
              ))}
              {rows.map((n, i) => (
                <Node key={n.key} n={n} row={i} muted={!visible(n)} />
              ))}
            </svg>
            <ol className="min-w-0">
              {rows.map((n) => {
                const on = visible(n);
                return (
                  <li
                    key={n.key}
                    style={{ height: H }}
                    onClick={() => setSel(n.key)}
                    className={`grid cursor-pointer grid-cols-[5rem_1fr_auto] items-center gap-3 border-b border-white/[0.05] pr-4 text-[13px] transition-colors ${sel === n.key ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"} ${on ? "" : "opacity-30"}`}
                    aria-current={sel === n.key ? "true" : undefined}
                  >
                    <span className={`w-fit rounded bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium capitalize ${n.tone === "danger" ? "text-danger" : n.tone === "dim" ? "text-gold-dim" : n.tone === "fg" ? "text-foreground" : "text-gold"}`}>
                      {n.tag}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-foreground/90">
                        {n.claimId != null && n.kind !== "BidFilled" && (
                          <button
                            onClick={(e) => (e.stopPropagation(), setFocus(focus === n.claimId ? null : n.claimId!))}
                            className={`mr-1.5 rounded-md px-1 text-[12px] ${focus === n.claimId ? "bg-gold text-background" : "text-gold hover:bg-white/[0.08]"}`}
                            title="isolate this claim"
                          >
                            #{n.claimId}
                          </button>
                        )}
                        {n.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {n.money[0] ? `${n.money[0][0]} ${n.money[0][1]}` : n.derived ? "no transaction" : n.detail.slice(0, 90)}
                      </span>
                    </span>
                    <span className="text-right text-[11px] text-muted-foreground" suppressHydrationWarning>
                      {ago(n.ts)} ago
                      <span className="block">{n.tx ? <TxLink hash={n.tx} label="tx" /> : <span className="text-gold-faint">derived</span>}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <aside className="order-first lg:order-none lg:sticky lg:top-20 lg:self-start">
          {selected && <Detail n={selected} />}
        </aside>
      </div>
    </div>
  );
}

function Detail({ n }: { n: LedgerNode }) {
  const tone = n.tone === "danger" ? "danger" : n.tone === "gold" ? "gold" : undefined;
  return (
    <div className={`rounded-md p-5 ${tone === "danger" ? "surface-danger" : tone === "gold" ? "surface-gold" : "surface"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12px] font-medium capitalize ${n.tone === "danger" ? "text-danger" : "text-gold"}`}>{n.tag}</span>
        <span className="text-[11px] text-muted-foreground">{when(n.ts)}</span>
      </div>
      <h3 className="mt-2 text-[15px] font-medium leading-snug text-foreground">
        {n.claimId != null && n.kind !== "BidFilled" && (
          <Link href={`/claim/${n.claimId}`} className="text-gold hover:underline">
            #{n.claimId}
          </Link>
        )}{" "}
        {n.title}
      </h3>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{n.detail}</p>

      {n.money.length > 0 && (
        <table className="mt-3 w-full text-[12px]">
          <tbody className="divide-y divide-white/[0.06]">
            {n.money.map(([k, v]) => (
              <tr key={k}>
                <td className="py-1.5 text-gold-dim">{k}</td>
                <td className={`py-1.5 text-right ${/slash|burn/.test(k) ? "text-danger" : "text-foreground"}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="mt-3 space-y-1.5 text-[12px]">
        {n.actor && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{n.kind === "Committed" || n.kind === "Slashed" ? "seller" : n.kind === "Purchased" ? "buyer" : n.kind === "Proposed" ? "proposer" : "actor"}</dt>
            <dd>
              {n.kind === "Committed" || n.kind === "Slashed" ? (
                <Addr a={n.actor} />
              ) : (
                <a href={`${EXPLORER}/address/${n.actor}`} target="_blank" rel="noreferrer" className="text-foreground/90 underline decoration-gold-faint underline-offset-2 hover:text-gold">
                  {n.actor.slice(0, 6)}…{n.actor.slice(-4)}
                </a>
              )}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">on chain</dt>
          <dd>{n.tx ? <><TxLink hash={n.tx} /> <span className="text-muted-foreground">block {n.block}</span></> : <span className="text-muted-foreground">none: derived from chain state and time</span>}</dd>
        </div>
        <div className="flex flex-wrap justify-end gap-1 pt-1">
          {n.lenses.map((l) => (
            <Tag key={l} tone="gold">
              {LENSES.find((x) => x.id === l)?.label}
            </Tag>
          ))}
        </div>
      </dl>

      <details className="mt-3 text-[11px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">raw event arguments</summary>
        <pre className="bab-scroll mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-black/30 p-3 font-mono text-[11px] text-foreground/80">
          {JSON.stringify(Object.fromEntries(Object.entries(n.args).map(([k, v]) => [k, typeof v === "string" && v.length > 120 ? `${v.slice(0, 120)}…` : v])), null, 1)}
        </pre>
      </details>
    </div>
  );
}
