"use client";
// Re-renders the server page on an interval so purchases, proposals and settlement appear without a reload.
// router.refresh() keeps client state, so a decrypted basket in the purchase panel survives it.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ every = 4000, active }: { every?: number; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), every);
    return () => clearInterval(id);
  }, [router, every, active]);
  return null;
}
