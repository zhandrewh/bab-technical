"use client";
// The b@b mark as a slowly rotating grid of hex digits. The block logo is drawn procedurally onto a
// 78x78 canvas (no cross-origin image, so no tainted-canvas failure), then bucketed by luminance x alpha so lit and
// shaded faces land in different gold shades and the 3D form survives in text. The digits live: they scramble in
// place and stream downward through the fixed shape, like data moving through the blocks.
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
    const chars = new Uint8Array(N * N).map(rnd); // digit index 0-15 per cell
    const noise = new Uint8Array(N * N).map(() => (Math.random() < 0.09 ? 1 : 0));
    const mk = () => document.createElement("canvas");
    const probe = mk().getContext("2d", { willReadFrequently: true })!;
    const rgb = ["--gold-faint", "--gold-dim", "--gold"].map((v) => {
      probe.fillStyle = css.getPropertyValue(v).trim();
      probe.clearRect(0, 0, 1, 1);
      probe.fillRect(0, 0, 1, 1);
      return probe.getImageData(0, 0, 1, 1).data.slice(0, 3);
    });

    // Rendered as persistent layers instead of re-blitting every lit cell each tick:
    //   digits  white glyphs for all cells, updated incrementally (a one-cell scroll + only the cells that changed)
    //   tint    the 78x78 shade map (logo + sparkle), scaled up with nearest-neighbour so each cell gets its gold
    //   mask    the radial vignette. Baked in here rather than a CSS mask on the rotating layer, which cost an extra
    //           full-viewport render pass every frame. It is radially symmetric about the centre of rotation, so
    //           rotating it with the canvas changes nothing.
    // Each tick is then a few hundred tiny blits plus three full-canvas GPU composites.
    // The cell size is a whole number of pixels so the scroll never resamples (and blurs) the glyphs.
    const glyphs = mk(), tint = mk(), mask = mk(), digits = [mk(), mk()];
    const dctx = digits.map((d) => d.getContext("2d")!);
    const tctx = tint.getContext("2d")!;
    tint.width = tint.height = N;
    const tintImg = tctx.createImageData(N, N);
    let c = 0, W = 0, cur = 0;

    const glyph = (x: CanvasRenderingContext2D, p: number) => {
      const px = (p % N) * c, py = ((p / N) | 0) * c;
      x.clearRect(px, py, c, c);
      x.drawImage(glyphs, chars[p] * c, 0, c, c, px, py, c, c);
    };

    const paintTint = () => {
      const d = tintImg.data;
      for (let p = 0; p < N * N; p++) {
        const s = grid[p] || noise[p];
        if (s) d.set(rgb[s - 1], p * 4);
        d[p * 4 + 3] = s ? 255 : 0;
      }
      tctx.putImageData(tintImg, 0, 0);
    };

    const compose = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(tint, 0, 0, W, W);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(digits[cur], 0, 0);
      ctx.drawImage(mask, 0, 0);
    };

    const resize = () => {
      const size = cv.clientWidth;
      if (!size) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c = Math.max(1, Math.round((size * dpr) / N));
      W = c * N;
      for (const el of [cv, mask, ...digits]) el.width = el.height = W;
      glyphs.width = c * 16;
      glyphs.height = c;
      const g = glyphs.getContext("2d")!;
      g.font = `${c * 0.95}px ${family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff";
      for (let i = 0; i < 16; i++) g.fillText(HEX[i], i * c + c / 2, c / 2);
      // Same stops as the old CSS mask: a circle reaching the viewport's farthest corner, in canvas pixels.
      const vp = cv.parentElement!;
      const R = (Math.hypot(vp.clientWidth, vp.clientHeight) / 2) * (W / size);
      const m = mask.getContext("2d")!;
      const grad = m.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, R);
      grad.addColorStop(0.5, "#000");
      grad.addColorStop(0.72, "rgba(0,0,0,.7)");
      grad.addColorStop(0.9, "rgba(0,0,0,0)");
      m.fillStyle = grad;
      m.fillRect(0, 0, W, W);
      for (let p = 0; p < N * N; p++) glyph(dctx[cur], p);
      paintTint();
      compose();
    };

    let t = 0;
    const step = () => {
      if (document.hidden || !W) return;
      t++;
      // Stream every column down one row every other tick; new digits enter at the top. The digit layer scrolls by
      // copying into the spare buffer one cell lower, so only the new top row is drawn.
      if (t % 2 === 0) {
        chars.copyWithin(N, 0, N * N - N);
        const next = dctx[cur ^ 1];
        next.clearRect(0, 0, W, W);
        next.drawImage(digits[cur], 0, 0, W, W - c, 0, c, W, W - c);
        cur ^= 1;
        for (let i = 0; i < N; i++) {
          chars[i] = rnd();
          glyph(next, i);
        }
      }
      // Scramble a slice of digits in place, and let the background sparkle drift.
      for (let k = 0; k < 260; k++) {
        const p = (Math.random() * N * N) | 0;
        chars[p] = rnd();
        glyph(dctx[cur], p);
      }
      for (let k = 0; k < 40; k++) {
        const p = (Math.random() * N * N) | 0;
        noise[p] = Math.random() < 0.09 ? 1 : 0;
      }
      paintTint();
      compose();
    };

    resize();
    // The atlas is baked once, so re-bake when DM Mono arrives rather than freezing the fallback face.
    document.fonts?.load(`16px ${family}`).then(resize, () => {});
    window.addEventListener("resize", resize);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = reduced ? 0 : window.setInterval(step, 90);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", resize);
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
