"use client";
// The b@b mark as a slowly rotating grid of hex digits. The block logo is drawn procedurally onto a
// 78x78 canvas (no cross-origin image, so no tainted-canvas failure), then bucketed by luminance x alpha so lit and
// shaded faces land in different gold shades and the 3D form survives in text. The digits live: they scramble in
// place and stream downward through the fixed shape, like data moving through the blocks.
import { useEffect, useRef } from "react";

const N = 78;
const HEX = "0123456789abcdef";
const rnd = () => HEX[(Math.random() * 16) | 0];

// The b@b logo: three exploded blocks in a triangle, each split into a lit top and a shaded body. Traced in a
// 246x206 reference frame, then scaled so the mark fills the grid around its centre.
const LIT = "#FECB33", SHADED = "#8a6420";
const LOGO: [string, [number, number][]][] = [
  // top block
  [LIT, [[82, 63], [100, 31], [140, 31], [122, 63]]],
  [LIT, [[84, 68], [120, 68], [108, 98], [100, 98]]],
  [SHADED, [[120, 68], [156, 68], [140, 98], [108, 98]]],
  // bottom-left block
  [LIT, [[36, 142], [52, 108], [96, 108], [80, 142]]],
  [SHADED, [[98, 110], [120, 148], [98, 180], [80, 146]]],
  [LIT, [[57, 180], [78, 148], [96, 180]]],
  // bottom-right block
  [LIT, [[127, 142], [142, 112], [184, 112], [168, 142]]],
  [LIT, [[128, 148], [168, 148], [182, 182], [146, 182]]],
  [SHADED, [[168, 148], [205, 148], [190, 182], [182, 182]]],
];

function drawMark(ctx: CanvasRenderingContext2D) {
  const k = 66 / 170; // logo spans ~170 reference px; fill 66 of the 78 cells
  for (const [fill, pts] of LOGO) {
    ctx.beginPath();
    pts.forEach(([x, y], n) => {
      const px = N / 2 + (x - 120) * k, py = N / 2 + (y - 106) * k;
      if (n) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

// Shade per cell: 0 empty, 1 faint, 2 dim, 3 bright.
function shadeGrid(): Uint8Array {
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  drawMark(x);
  const d = x.getImageData(0, 0, N, N).data;
  const g = new Uint8Array(N * N);
  for (let p = 0; p < N * N; p++) {
    const v = (d[p * 4 + 3] / 255) * ((0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2]) / 255);
    g[p] = v > 0.5 ? 3 : v > 0.28 ? 2 : v > 0.05 ? 1 : 0;
  }
  return g;
}

export function HexBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let grid: Uint8Array;
    try {
      grid = shadeGrid();
    } catch {
      return;
    }
    const ctx = cv.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const shade = ["", css.getPropertyValue("--gold-faint").trim(), css.getPropertyValue("--gold-dim").trim(), css.getPropertyValue("--gold").trim()];
    const family = css.getPropertyValue("--font-dm-mono").trim() || "ui-monospace, monospace";
    const chars = Array.from({ length: N * N }, rnd);
    const noise = new Uint8Array(N * N).map(() => (Math.random() < 0.09 ? 1 : 0));
    let cell = 0;

    const resize = () => {
      const size = cv.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.round(size * dpr);
      cell = cv.width / N;
      ctx.font = `${cell * 0.95}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    };

    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let s = 1; s <= 3; s++) {
        ctx.fillStyle = shade[s];
        for (let p = 0; p < N * N; p++) {
          if ((grid[p] || noise[p]) !== s) continue;
          ctx.fillText(chars[p], (p % N + 0.5) * cell, (((p / N) | 0) + 0.5) * cell);
        }
      }
    };

    let t = 0;
    const step = () => {
      t++;
      // Stream every column down one row every other tick; new digits enter at the top.
      if (t % 2 === 0) {
        for (let p = N * N - 1; p >= N; p--) chars[p] = chars[p - N];
        for (let i = 0; i < N; i++) chars[i] = rnd();
      }
      // Scramble a slice of digits in place, and let the background sparkle drift.
      for (let k = 0; k < 260; k++) chars[(Math.random() * N * N) | 0] = rnd();
      for (let k = 0; k < 40; k++) {
        const p = (Math.random() * N * N) | 0;
        noise[p] = Math.random() < 0.09 ? 1 : 0;
      }
      draw();
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = reduced ? 0 : window.setInterval(step, 90);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        maskImage: "radial-gradient(circle at center, black 50%, rgba(0,0,0,.7) 72%, transparent 90%)",
        WebkitMaskImage: "radial-gradient(circle at center, black 50%, rgba(0,0,0,.7) 72%, transparent 90%)",
      }}
    >
      <canvas
        ref={ref}
        className="bab-spin absolute left-1/2 top-1/2"
        style={{ ["--s" as string]: "min(88vh, 88vw)", width: "var(--s)", aspectRatio: "1", margin: "calc(var(--s) / -2) 0 0 calc(var(--s) / -2)", opacity: 0.62, willChange: "transform" }}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 36% 28% at center, rgba(10,10,10,.55) 0%, rgba(10,10,10,.3) 55%, transparent 100%)" }} />
    </div>
  );
}
