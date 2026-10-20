import { apiFetchResponse } from "@/shared/api/client";
import {
  parseHumanTemplate,
  humanScopes,
  type HumanScope,
  type HumanTemplate,
} from "../preview/humanReference/template";
const templates = new Map<HumanScope, Promise<HumanTemplate>>();
export async function boundedReferenceBytes(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw Error("빈 인체 참고 자산입니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const p = await reader.read();
      if (p.done) break;
      size += p.value.length;
      if (size > max) throw Error("인체 참고 자산이 너무 큽니다.");
      chunks.push(p.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
export async function referenceDigest(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function template(scope: HumanScope) {
  const response = await apiFetchResponse(`/v1/pose-candidates/default-body-template/${scope}`, {
    auth: false,
    signal: AbortSignal.timeout(10_000),
  });
  const h = response.headers;
  if (
    h.get("Content-Type") !== "application/json" ||
    h.get("X-Standin-Template-Version") !== "default-body-template-v1" ||
    h.get("X-Standin-Output-Scope") !== scope ||
    h.get("X-Standin-Preview-Only") !== "true" ||
    h.get("X-Standin-Preview-Method") !== "reference-skinning-v1"
  ) {
    await response.body?.cancel();
    throw Error("기본 인체 참고 출처를 확인하지 못했습니다.");
  }
  // HTTP gzip is decoded by the platform, including older desktop webviews.
  const raw = await boundedReferenceBytes(response, 16_000_000);
  const rawDigest = await referenceDigest(raw);
  if (
    rawDigest !== h.get("X-Standin-Artifact-SHA256") ||
    rawDigest !== h.get("X-Standin-Template-JSON-SHA256") ||
    !/^[a-f0-9]{64}$/.test(h.get("X-Standin-Template-SHA256") ?? "")
  )
    throw Error("기본 인체 메시를 확인하지 못했습니다.");
  const parsed = parseHumanTemplate(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    scope,
  );
  if (
    h.get("X-Standin-Character-Id") !== parsed.character_id ||
    h.get("X-Standin-Character-SHA256") !== parsed.character_sha256
  )
    throw Error("기본 인체가 변경되었습니다.");
  return parsed;
}
export async function loadHumanTemplate(scope: string, signal: AbortSignal) {
  if (!humanScopes.includes(scope as HumanScope)) throw Error("지원하지 않는 참고 범위입니다.");
  const key = scope as HumanScope;
  if (!templates.has(key))
    templates.set(
      key,
      template(key).catch((error) => {
        templates.delete(key);
        throw error;
      }),
    );
  const result = await templates.get(key)!;
  signal.throwIfAborted();
  return result;
}
export async function loadHumanReference(
  sourceUrl: string,
  expectedSource: string | undefined,
  scope: string,
  signal: AbortSignal,
  presentation = false,
) {
  const normal = /^\/v1\/pose-candidates\/[^/]+\/poster-source\?/.test(sourceUrl);
  const owned =
    /^\/v1\/analysis\/jobs\/[^/]+\/people\/\d+\/pose-previews\/preview_[a-f0-9]{64}\/[a-f0-9]{64}$/.test(
      sourceUrl,
    );
  if ((presentation ? !owned : !normal) || sourceUrl.includes("\\") || sourceUrl.includes("#"))
    throw Error("잘못된 참고 원본 경로입니다.");
  const response = await apiFetchResponse(sourceUrl, { auth: false, signal });
  const declared =
    response.headers.get("X-Standin-Source-BVH-SHA256") ??
    response.headers.get("X-Standin-BVH-SHA256");
  if (
    !/^[a-f0-9]{64}$/.test(declared ?? "") ||
    (expectedSource && declared !== expectedSource) ||
    (!presentation &&
      (response.headers.get("X-Standin-Output-Scope") !== scope ||
        response.headers.get("X-Standin-Preview-Only") !== "true"))
  ) {
    await response.body?.cancel();
    throw Error("포즈 참고 원본이 변경되었습니다.");
  }
  const bytes = await boundedReferenceBytes(response, 2_000_000);
  if ((await referenceDigest(bytes)) !== declared) throw Error("BVH가 변경되었습니다.");
  const mesh = await loadHumanTemplate(scope, signal);
  const { renderHumanReference } = await import("../preview/humanReference/render");
  return renderHumanReference(
    mesh,
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    signal,
  );
}
