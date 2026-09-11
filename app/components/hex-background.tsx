"use client";
// The b@b mark as a slowly rotating grid of hex digits. The isometric block mark is drawn procedurally onto a
// 78x78 canvas (no cross-origin image, so no tainted-canvas failure), then bucketed by luminance x alpha so lit and
// shaded faces land in different gold shades and the 3D form survives in text.
import { useEffect, useState } from "react";

const N = 78;
const HEX = "0123456789abcdef";
const SHADE = ["transparent", "var(--gold-faint)", "var(--gold-dim)", "var(--gold)"];

function drawMark(ctx: CanvasRenderingContext2D) {
  const s = 7.2; // cube edge in canvas px
  const cx = N / 2, cy = N / 2 + 4;
  const iso = (i: number, j: number, k: number) => [cx + (i - j) * 0.866 * s, cy + (i + j) * 0.5 * s - k * s - s * 1.5] as const;
  const poly = (pts: (readonly [number, number])[], fill: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const cube = (i: number, j: number, k: number) => {
    const [x, y] = iso(i, j, k);
    const h = 0.866 * s;
    const inset = 0.6;
    poly([[x, y - s + inset], [x + h - inset, y - s / 2], [x, y - inset], [x - h + inset, y - s / 2]], "#FECB33");
    poly([[x - h + inset, y - s / 2 + inset], [x - inset / 2, y + inset / 2], [x - inset / 2, y + s - inset], [x - h + inset, y + s / 2]], "#EAA536");
    poly([[x + inset / 2, y + inset / 2], [x + h - inset, y - s / 2 + inset], [x + h - inset, y + s / 2], [x + inset / 2, y + s - inset]], "#8a6420");
  };
  // Stepped pyramid of blocks: 3x3, 2x2, 1. Painter's order: back to front, bottom to top.
  const blocks: [number, number, number][] = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < 3 - k; i++) for (let j = 0; j < 3 - k; j++) blocks.push([i + k * 0.5, j + k * 0.5, k]);
  blocks.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]).forEach(([i, j, k]) => cube(i - 1, j - 1, k));
}

export function HexBackground() {
  const [html, setHtml] = useState("");
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = N;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      drawMark(x);
      const d = x.getImageData(0, 0, N, N).data;
      let out = "";
      for (let y = 0; y < N; y++) {
        let row = "";
        let run: { s: number; t: string } | null = null;
        const flush = () => run && (row += `<span style="color:${SHADE[run.s]}">${run.t}</span>`);
        for (let i = 0; i < N; i++) {
          const p = (y * N + i) * 4;
          const v = (d[p + 3] / 255) * ((0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255);
          const s = v > 0.5 ? 3 : v > 0.28 ? 2 : v > 0.05 ? 1 : Math.random() < 0.09 ? 1 : 0; // keep noise sparse
          const ch = s ? HEX[(Math.random() * 16) | 0] : " ";
          if (run && run.s === s) run.t += ch;
          else {
            flush();
            run = { s, t: ch };
          }
        }
        flush();
        out += `<div>${row}</div>`;
      }
      setHtml(out);
    } catch {
      setHtml("");
    }
  }, []);

  if (!html) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        maskImage: "radial-gradient(circle at center, black 45%, rgba(0,0,0,.55) 68%, transparent 85%)",
        WebkitMaskImage: "radial-gradient(circle at center, black 45%, rgba(0,0,0,.55) 68%, transparent 85%)",
      }}
    >
      <div
        className="bab-spin absolute left-1/2 top-1/2"
        style={{ ["--s" as string]: "min(82vh, 82vw)", width: "var(--s)", aspectRatio: "1", margin: "calc(var(--s) / -2) 0 0 calc(var(--s) / -2)", opacity: 0.32, willChange: "transform" }}
      >
        <pre
          className="m-0 select-none"
          style={{ fontSize: "calc(var(--s) / 78 * 0.95)", letterSpacing: "calc(var(--s) / 78 * 0.05)", lineHeight: "calc(var(--s) / 78)" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 42% 34% at center, var(--background) 0%, rgba(10,10,10,.72) 55%, transparent 100%)" }} />
    </div>
  );
}
