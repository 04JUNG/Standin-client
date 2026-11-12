import { apiFetchResponse, currentInstallationId } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { verifyDigest } from "@/features/body-selection/api";
import { preparedIdentity, type PreparedFile } from "./preparedArtifact";

const MAX_BYTES = 30 * 1024 * 1024;
const cache = new Map<string, { data: ArrayBuffer; file: PreparedFile; expires: number }>();
const changed = () => new ApiError(409, "PREVIEW_CHANGED", "확인한 파일이 변경되었습니다.");

function key(url: string) {
  const owner = currentInstallationId();
  const u = new URL(url, "https://standin.invalid");
  if (
    u.origin !== "https://standin.invalid" ||
    !/^\/v1\/pose-candidates\/[^/]+\/framed$/.test(u.pathname)
  )
    throw changed();
  const receipt = u.searchParams.get("artifactReceipt");
  if (!owner || !receipt || !/^[a-f0-9]{64}$/.test(receipt)) return undefined;
  return JSON.stringify([
    owner,
    u.pathname,
    u.searchParams.get("jobId"),
    u.searchParams.get("personIndex"),
    u.searchParams.get("candidateId"),
    receipt,
  ]);
}
function check(response: Response, file: PreparedFile) {
  const identity = preparedIdentity(response);
  if (
    Object.entries(file.identity).some(([k, v]) => identity[k as keyof typeof identity] !== v) ||
    Object.entries(file.headers).some(([k, v]) => response.headers.get(k) !== v)
  )
    throw changed();
}
async function boundedBytes(response: Response, signal: AbortSignal) {
  const size = Number(response.headers.get("Content-Length"));
  if (size > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("FBX size limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty FBX");
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new Error("FBX size limit");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes.buffer;
}

/** No PNG job: retrieve and verify the file already prepared by the converter. */
export async function loadPreparedFbx(url: string, file: PreparedFile, signal: AbortSignal) {
  const parsed = new URL(url, "https://standin.invalid");
  if (parsed.searchParams.get("artifactReceipt") !== file.identity.reviewKey) throw changed();
  const cacheKey = key(url);
  parsed.searchParams.set("format", "review-fbx");
  const response = await apiFetchResponse(parsed.pathname + parsed.search, { auth: false, signal });
  try {
    check(response, file);
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
  const data = await boundedBytes(response, signal);
  if (
    new TextDecoder().decode(new Uint8Array(data, 0, Math.min(23, data.byteLength))) !==
    "Kaydara FBX Binary  \u0000\u001a\u0000"
  )
    throw new Error("invalid FBX");
  await verifyDigest(data, file.identity.artifactSha256);
  signal.throwIfAborted();
  if (cacheKey) {
    cache.delete(cacheKey);
    cache.set(cacheKey, { data, file, expires: Date.now() + 300_000 });
    let size = [...cache.values()].reduce((n, v) => n + v.data.byteLength, 0);
    while (cache.size > 3 || size > 60 * 1024 * 1024) {
      const first = cache.keys().next().value!;
      size -= cache.get(first)!.data.byteLength;
      cache.delete(first);
    }
  }
  return data;
}

/** Reauthorize at save time. HEAD retains all server selection/lineage checks. */
export async function fetchPreparedFbxResponse(url: string, signal?: AbortSignal) {
  const parsed = new URL(url, "https://standin.invalid");
  if (!parsed.searchParams.has("artifactReceipt"))
    return apiFetchResponse(url, { auth: false, signal });
  const cacheKey = key(url);
  const hit = cacheKey ? cache.get(cacheKey) : undefined;
  if (!hit || hit.expires < Date.now()) {
    if (cacheKey) cache.delete(cacheKey);
    return apiFetchResponse(url, { auth: false, signal });
  }
  const response = await apiFetchResponse(url, { auth: false, method: "HEAD", signal });
  check(response, hit.file);
  signal?.throwIfAborted();
  return new Response(hit.data.slice(0), { headers: response.headers });
}
export function forgetPreparedFbx(job: string) {
  for (const k of cache.keys()) if (JSON.parse(k)[2] === job) cache.delete(k);
}
