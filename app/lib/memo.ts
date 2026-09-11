// Share one in-flight/recent result across callers: a page that loads the market and the event log (or several
// visitors polling the feed) costs one RPC round-trip instead of one each. Failures are not cached.
export function memoFor<T>(ms: number, fn: () => Promise<T>): () => Promise<T> {
  let hit: { at: number; p: Promise<T> } | null = null;
  return () => {
    if (hit && Date.now() - hit.at < ms) return hit.p;
    const p = fn();
    hit = { at: Date.now(), p };
    p.catch(() => {
      if (hit?.p === p) hit = null;
    });
    return p;
  };
}

/** One Base block: nothing newer can exist within this window. */
export const BLOCK_MS = 2_000;
