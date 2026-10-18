import type { BodySelection } from "@/features/body-selection/contract";
import { apiFetchResponse } from "@/shared/api/client";
import { validateModel } from "@/features/pose-viewer/preview/modelContract";
import type { ReviewModel } from "@/features/pose-viewer/preview/mountReviewModel";
import type { PreviewCandidate } from "@/features/pose-viewer/api/posePresentation";
const CHARACTER = "standin-master-v2";
const sha = (s: string | null): s is string => !!s && /^[a-f0-9]{64}$/.test(s);
async function readSemanticModel(
  candidate: PreviewCandidate,
  signal: AbortSignal,
  selection?: BodySelection,
): Promise<ReviewModel> {
  const characterId = selection?.resolvedBody?.characterId ?? CHARACTER;
  if (selection && (selection.resolutionStatus !== "ready" || !selection.resolvedBody))
    throw Error("body unavailable");
  const url = candidate.asset.preview_bvh_url;
  if (
    !/^\/v1\/analysis\/jobs\/[^/]+\/people\/\d+\/pose-previews\/preview_[a-f0-9]{64}\/[a-f0-9]{64}$/.test(
      url,
    )
  )
    throw Error("invalid model URL");
  const r = await apiFetchResponse(
    url + "/model" + (selection ? "?bodyRevision=" + selection.selectionRevision : ""),
    { auth: false, signal },
  );
  const sourceSha = r.headers.get("X-Standin-Source-BVH-SHA256"),
    characterSha256 = r.headers.get("X-Standin-Character-SHA256"),
    modelRevision = r.headers.get("X-Standin-Model-Revision"),
    digest = r.headers.get("X-Standin-Artifact-SHA256"),
    version = r.headers.get("X-Standin-Model-Version");
  if (
    r.headers.get("Content-Type") !== "model/gltf-binary" ||
    r.headers.get("X-Standin-Preview-Only") !== "true" ||
    r.headers.get("X-Standin-Character-Id") !== characterId ||
    sourceSha !== candidate.asset.bvh_sha256 ||
    !sha(characterSha256) ||
    !sha(modelRevision) ||
    !sha(digest) ||
    (version !== "posed-mesh-v1" && version !== "framed-mesh-v1")
  ) {
    await r.body?.cancel();
    throw Error("invalid model identity");
  }
  const reader = r.body?.getReader();
  if (!reader) throw Error("empty model");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const p = await reader.read();
      if (p.done) break;
      size += p.value.byteLength;
      if (size > 8 * 1024 * 1024) throw Error("model too large");
      chunks.push(p.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== digest) throw Error("model digest mismatch");
  if (
    selection &&
    (r.headers.get("X-Standin-Body-Revision") !== String(selection.selectionRevision) ||
      r.headers.get("X-Standin-Body-Shape-SHA256") !== (selection.shape?.shapeSha256 ?? "none") ||
      characterSha256 !== selection.resolvedBody!.assetSha256)
  )
    throw Error("body selection changed");
  const data = bytes.buffer,
    meta = validateModel(data, sourceSha, characterId, "full", version);
  if (meta.character_sha256 !== characterSha256 || meta.revision !== modelRevision)
    throw Error("model identity changed");
  if (selection && (meta.shape_sha256 ?? null) !== (selection.shape?.shapeSha256 ?? null))
    throw Error("body shape changed");
  return {
    data,
    characterId,
    ...(selection ? { shapeSha256: selection.shape?.shapeSha256 ?? null } : {}),
    scope: "full",
    version,
    sourceSha,
    characterSha256,
    modelRevision,
  };
}

// Keep fallback Blender work bounded when all candidate cards mount together.
let pending = Promise.resolve();
export async function loadSemanticModel(
  candidate: PreviewCandidate,
  signal: AbortSignal,
  selection?: BodySelection,
): Promise<ReviewModel> {
  const previous = pending;
  let release!: () => void;
  pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    signal.throwIfAborted();
    return await readSemanticModel(candidate, signal, selection);
  } finally {
    release();
  }
}
