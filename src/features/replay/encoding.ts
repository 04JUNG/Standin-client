import { gzipSync, strToU8 } from "fflate";
export function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export async function encodeEvents(events: unknown[]) {
  const raw = strToU8(JSON.stringify(events));
  return {
    contentHash: await sha256(raw),
    encoding: "gzip-base64" as const,
    data: base64(gzipSync(raw)),
    rawBytes: raw.length,
  };
}
