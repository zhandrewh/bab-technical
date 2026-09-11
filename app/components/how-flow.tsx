"use client";
// The walkthrough: plain prose on one side, a flowchart on the other that advances as you read. A sealed packet
// travels down the spine; it opens at the unlock step and the settle node fans out into the three outcomes.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnBase, btnVariant } from "./ui";

export type Step = { id: string; label: string; heading: string; body: React.ReactNode; example?: React.ReactNode };

const OUTCOMES: { label: string; tone: string }[] = [
  { label: "true", tone: "var(--gold)" },
  { label: "false", tone: "var(--danger)" },
  { label: "fabricated", tone: "var(--danger)" },
];

const MAIN = 6; // steps on the spine before it fans out
const GAP = 84;

/** Coordinates for either orientation. Vertical: spine at x=40, labels to the right. Horizontal: spine at y=30. */
function geom(vertical: boolean) {
  const spine = 40;
  const at = (i: number) => (vertical ? { x: spine, y: 36 + i * GAP } : { x: 36 + i * GAP, y: 30 });
  return { at, spine };
}

export function HowFlow({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-12">
      {/* Horizontal strip on small screens, sticky under the header. */}
      <div className="sticky top-[52px] z-10 -mx-4 mb-6 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-md lg:hidden">
        <Chart steps={steps} active={active} vertical={false} />
      </div>
      <div className="hidden lg:block">
        <div className="sticky top-24">
          <Chart steps={steps} active={active} vertical />
        </div>
      </div>

      <div className="space-y-24 lg:space-y-32 lg:pt-4">
        {steps.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            data-step={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`max-w-xl scroll-mt-32 transition-opacity duration-500 ${i === active ? "opacity-100" : "opacity-60"}`}
          >
            <div className="text-[12px] font-medium text-gold">{s.label}</div>
            <h2 className="mt-1 font-serif text-[30px] leading-tight text-foreground sm:text-[34px]">{s.heading}</h2>
            <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-foreground/85">{s.body}</div>
            {s.example && <div className="mt-5 border-l-2 border-gold-faint pl-4 text-[13px] leading-relaxed text-foreground/80">{s.example}</div>}
          </section>
        ))}

        <section className="max-w-xl space-y-4 pb-16">
          <h2 className="font-serif text-[30px] leading-tight">See it for yourself</h2>
          <p className="text-[15px] leading-relaxed text-foreground/85">Every step above is a transaction you can open. The ledger draws them as one history.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ledger" className={`${btnBase} ${btnVariant.primary}`}>Open the ledger</Link>
            <Link href="/market" className={`${btnBase} ${btnVariant.idle}`}>Browse the market</Link>
            <Link href="/agents" className={`${btnBase} ${btnVariant.idle}`}>Run it as an agent</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Chart({ steps, active, vertical }: { steps: Step[]; active: number; vertical: boolean }) {
  const g = geom(vertical);
  const first = g.at(0), settle = g.at(MAIN - 1), record = g.at(MAIN);
  const fan = OUTCOMES.map((_, j) => (vertical ? { x: g.spine + 60 + j * 46, y: settle.y + 44 } : { x: settle.x + 42, y: settle.y + 22 + j * 16 }));
  const progress = Math.min(active, MAIN - 1) / (MAIN - 1);
  const unlocked = active >= 3;
  const fanned = active >= MAIN - 1;
  const recorded = active >= MAIN;
  const packet = active >= MAIN ? record : g.at(Math.min(active, MAIN - 1));
  const w = vertical ? 240 : 36 + MAIN * GAP + 40;
  const h = vertical ? record.y + 40 : 100;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={vertical ? "h-[calc(100vh-9rem)] max-h-[640px] w-auto" : "h-[86px] w-full"} preserveAspectRatio={vertical ? "xMinYMin meet" : "xMidYMid meet"} role="img" aria-label={`Step ${active + 1} of ${steps.length}: ${steps[active]?.label}`}>
      {/* Spine: faint track, then the gold fill that grows with the reader. */}
      <line x1={first.x} y1={first.y} x2={settle.x} y2={settle.y} stroke="var(--gold-faint)" strokeWidth={2} />
      <line x1={first.x} y1={first.y} x2={settle.x} y2={settle.y} stroke="var(--gold)" strokeWidth={2} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} className="bab-motion" style={{ transition: "stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)" }} />

      {/* Fan-out to the three outcomes, then back into the record. */}
      {fan.map((p, j) => (
        <g key={j} opacity={fanned ? 1 : 0.25} style={{ transition: "opacity .5s" }}>
          <path d={`M ${settle.x} ${settle.y} C ${vertical ? `${settle.x} ${p.y}, ${p.x} ${settle.y}` : `${p.x} ${settle.y}, ${settle.x} ${p.y}`}, ${p.x} ${p.y}`} fill="none" stroke={fanned ? OUTCOMES[j].tone : "var(--gold-faint)"} strokeWidth={1.5} />
          <path d={`M ${p.x} ${p.y} C ${vertical ? `${p.x} ${record.y}, ${record.x} ${p.y}` : `${record.x} ${p.y}, ${p.x} ${record.y}`}, ${record.x} ${record.y}`} fill="none" stroke={recorded ? OUTCOMES[j].tone : "var(--gold-faint)"} strokeWidth={1.5} opacity={recorded ? 1 : 0.4} />
          <circle cx={p.x} cy={p.y} r={4} fill={fanned ? OUTCOMES[j].tone : "var(--background)"} stroke={OUTCOMES[j].tone} strokeWidth={1.5} />
          <text x={vertical ? p.x : p.x + 9} y={vertical ? p.y + 16 : p.y + 3.5} textAnchor={vertical ? "middle" : "start"} fontSize={vertical ? 10 : 8} fill={fanned ? OUTCOMES[j].tone : "var(--muted-foreground)"} fontFamily="var(--font-poppins)">
            {OUTCOMES[j].label}
          </text>
        </g>
      ))}

      {/* Nodes and labels. */}
      {steps.map((s, i) => {
        const p = i >= MAIN ? record : g.at(i);
        const lit = i <= active;
        return (
          <g key={s.id} style={{ transition: "opacity .4s" }} opacity={lit ? 1 : 0.45}>
            <circle cx={p.x} cy={p.y} r={i === active ? 7 : 5.5} fill={lit ? "var(--gold)" : "var(--background)"} stroke="var(--gold)" strokeWidth={2} style={{ transition: "r .3s" }} />
            {i === active && <circle cx={p.x} cy={p.y} r={12} fill="none" stroke="var(--gold)" strokeWidth={1} opacity={0.5} />}
            <text
              x={vertical ? p.x + 22 : p.x}
              y={vertical ? p.y + 4 : p.y + 24}
              textAnchor={vertical ? "start" : "middle"}
              fontSize={vertical ? 13 : 10}
              fontWeight={i === active ? 600 : 500}
              fill={i === active ? "var(--foreground)" : "var(--muted-foreground)"}
              fontFamily="var(--font-poppins)"
            >
              {s.label}
            </text>
          </g>
        );
      })}

      {/* The packet: sealed until unlock, then open. Travels with the reader. */}
      <g transform={`translate(${packet.x - 9}, ${packet.y - 9})`} style={{ transition: "transform .6s cubic-bezier(.34,1.3,.64,1)" }} className="bab-motion">
        <rect x={0} y={0} width={18} height={18} rx={4} fill="var(--background)" stroke={unlocked ? "var(--foreground)" : "var(--gold)"} strokeWidth={1.5} />
        {unlocked ? (
          <>
            <path d="M6 9 V7 a3 3 0 0 1 6 0" fill="none" stroke="var(--foreground)" strokeWidth={1.4} strokeLinecap="round" transform="translate(-2.5,-1)" />
            <rect x={5.5} y={8.5} width={7} height={5} rx={1} fill="var(--foreground)" />
          </>
        ) : (
          <>
            <path d="M6 9 V7 a3 3 0 0 1 6 0 V9" fill="none" stroke="var(--gold)" strokeWidth={1.4} strokeLinecap="round" />
            <rect x={5.5} y={8.5} width={7} height={5} rx={1} fill="var(--gold)" />
          </>
        )}
      </g>
    </svg>
  );
}
