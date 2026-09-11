"use client";
// The b@b mark as a slowly rotating grid of hex digits. The block logo is drawn procedurally onto a
// 78x78 canvas (no cross-origin image, so no tainted-canvas failure), then bucketed by luminance x alpha so lit and
// shaded faces land in different gold shades and the 3D form survives in text. The digits are fixed; only the CSS
// rotation moves.
import { useEffect, useRef } from "react";

const N = 78;
const HEX = "0123456789abcdef";
const rnd = () => (Math.random() * 16) | 0;
const VIGNETTE = "radial-gradient(circle at center, black 50%, rgba(0,0,0,.7) 72%, transparent 90%)";

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
    const family = css.getPropertyValue("--font-dm-mono").trim() || "ui-monospace, monospace";
    const colors = ["--gold-faint", "--gold-dim", "--gold"].map((v) => css.getPropertyValue(v).trim());
    // Fixed digits and sparkle, chosen once. The canvas is painted only on mount, font load and resize; the spin is a
    // pure CSS transform, so the compositor rotates a static texture and no per-frame JS or re-upload happens.
    const chars = new Uint8Array(N * N).map(rnd);
    const noise = new Uint8Array(N * N).map(() => (Math.random() < 0.09 ? 1 : 0));

    const paint = () => {
      const size = cv.clientWidth;
      if (!size) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = Math.max(1, Math.round((size * dpr) / N));
      const W = (cv.width = cv.height = c * N);
      ctx.font = `${c * 0.95}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let s = 1; s <= 3; s++) {
        ctx.fillStyle = colors[s - 1];
        for (let p = 0; p < N * N; p++) {
          if ((grid[p] || noise[p]) !== s) continue;
          ctx.fillText(HEX[chars[p]], (p % N) * c + c / 2, ((p / N) | 0) * c + c / 2);
        }
      }
      // Vignette baked in (radially symmetric, so rotation doesn't change it): a circle reaching the viewport's
      // farthest corner, in canvas pixels.
      const vp = cv.parentElement!;
      const R = (Math.hypot(vp.clientWidth, vp.clientHeight) / 2) * (W / size);
      const grad = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, R);
      grad.addColorStop(0.5, "#000");
      grad.addColorStop(0.72, "rgba(0,0,0,.7)");
      grad.addColorStop(0.9, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, W);
      ctx.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    };
    paint();
    // Repaint once DM Mono arrives rather than keeping the fallback face.
    document.fonts?.load(`16px ${family}`).then(paint, () => {});
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas
        ref={ref}
        className="bab-spin absolute left-1/2 top-1/2"
        style={{ ["--s" as string]: "min(88vh, 88vw)", width: "var(--s)", aspectRatio: "1", margin: "calc(var(--s) / -2) 0 0 calc(var(--s) / -2)", opacity: 0.62, willChange: "transform" }}
      />
      {/* Static layer, so its CSS mask is rasterised once; the canvas bakes the same vignette itself. */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 36% 28% at center, rgba(10,10,10,.55) 0%, rgba(10,10,10,.3) 55%, transparent 100%)",
          maskImage: VIGNETTE,
          WebkitMaskImage: VIGNETTE,
        }}
      />
    </div>
  );
}
