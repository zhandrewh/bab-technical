"use client";
// Makes the liquid-glass sheen follow the pointer: sets --mx/--my on whichever glass surface is under it.
// Coalesced to one update per frame: pointermove can fire several times a frame, and each read of the rect forces layout.
import { useEffect } from "react";

const SEL = ".glass, .glass-gold, .glass-danger";

export function GlassPointer() {
  useEffect(() => {
    let last: HTMLElement | null = null;
    let pending: PointerEvent | null = null;
    let frame = 0;
    const clear = () => {
      last?.style.removeProperty("--mx");
      last?.style.removeProperty("--my");
      last = null;
    };
    const apply = () => {
      frame = 0;
      const e = pending;
      pending = null;
      if (!e) return;
      const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
      if (el !== last) clear();
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
      last = el;
    };
    const move = (e: PointerEvent) => {
      pending = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      pending = null;
      clear();
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return null;
}
