// Base64 that works identically in Node and the browser (no Buffer in client bundles).
export function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export const utf8ToB64 = (s: string) => b64(new TextEncoder().encode(s));
export const b64ToUtf8 = (s: string) => new TextDecoder().decode(unb64(s));
