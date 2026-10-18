import { expect, it, vi } from "vitest";
import { apiFetchResponse } from "@/shared/api/client";
import type { PreviewCandidate } from "@/features/pose-viewer/api/posePresentation";
import { loadSemanticModel } from "./modelPreview";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
const hash = "a".repeat(64),
  revision = "b".repeat(64),
  characterSha = "c".repeat(64);
const candidate = {
  asset: {
    preview_bvh_url: `/v1/analysis/jobs/job_x/people/0/pose-previews/preview_${"d".repeat(64)}/${hash}`,
    bvh_sha256: hash,
  },
} as PreviewCandidate;
async function response(changes: Record<string, string> = {}, metaChanges = {}) {
  const doc = {
    asset: {
      extras: {
        version: "posed-mesh-v1",
        source_bvh_sha256: hash,
        character_id: "standin-master-v2",
        character_sha256: characterSha,
        revision,
        scope: "full",
        coordinates: "Y-up-hips-origin",
        ...metaChanges,
      },
    },
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{}] }],
    buffers: [{ byteLength: 4 }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc)),
    size = Math.ceil(json.length / 4) * 4,
    bytes = new Uint8Array(size + 32),
    v = new DataView(bytes.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, bytes.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + size);
  bytes.set(json, 20);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return new Response(bytes, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "X-Standin-Preview-Only": "true",
      "X-Standin-Character-Id": "standin-master-v2",
      "X-Standin-Source-BVH-SHA256": hash,
      "X-Standin-Character-SHA256": characterSha,
      "X-Standin-Model-Revision": revision,
      "X-Standin-Model-Version": "posed-mesh-v1",
      "X-Standin-Artifact-SHA256": digest,
      ...changes,
    },
  });
}
it("loads an authenticated fixed male GLB bound to the actual candidate, character and model revision", async () => {
  vi.mocked(apiFetchResponse).mockResolvedValueOnce(await response());
  const model = await loadSemanticModel(candidate, new AbortController().signal);
  expect(model.characterId).toBe("standin-master-v2");
  expect(model.sourceSha).toBe(hash);
  expect(model.version).toBe("posed-mesh-v1");
  expect(apiFetchResponse).toHaveBeenLastCalledWith(
    candidate.asset.preview_bvh_url + "/model",
    expect.objectContaining({ auth: false }),
  );
});
const invalidHeaders: Record<string, string>[] = [
  { "X-Standin-Preview-Only": "false" },
  { "X-Standin-Character-Id": "female" },
  { "X-Standin-Source-BVH-SHA256": "e".repeat(64) },
  { "X-Standin-Artifact-SHA256": "f".repeat(64) },
];
it.each(invalidHeaders)("rejects a changed model identity or digest %j", async (headers) => {
  vi.mocked(apiFetchResponse).mockResolvedValueOnce(await response(headers));
  await expect(loadSemanticModel(candidate, new AbortController().signal)).rejects.toThrow();
});
it("rejects embedded lineage even when the response digest is correct", async () => {
  vi.mocked(apiFetchResponse).mockResolvedValueOnce(
    await response({}, { character_sha256: "e".repeat(64) }),
  );
  await expect(loadSemanticModel(candidate, new AbortController().signal)).rejects.toThrow();
});
