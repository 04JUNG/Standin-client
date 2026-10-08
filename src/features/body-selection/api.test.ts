import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import { ApiError } from "@/shared/api/errors";
import { getManifest, renderBodyCandidate } from "./api";
import { downloadBodyReview, loadBodyReview } from "./review";
import type { BodyManifest, BodySelection } from "./contract";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ref = {
  bodyId: "body",
  bodyVersion: "1",
  characterId: "body",
  assetSha256: sha("body"),
  rigVersion: "1",
  measurementVersion: "1",
};
const selection: BodySelection = {
  schemaVersion: "body-selection.v1",
  personIndex: 0,
  intent: "inherit",
  manualCharacterId: null,
  recommendation: { status: "available", body: ref, reasonCodes: [] },
  resolvedBody: ref,
  resolvedSource: "auto_recommendation",
  resolutionStatus: "ready",
  selectionRevision: 1,
};
const root = "/v1/analysis/jobs/job/people/0/body-previews/" + sha("key");
const manifest: BodyManifest = {
  schemaVersion: "body-previews.v1",
  jobId: "job",
  personIndex: 0,
  selectionRevision: 1,
  resolvedBody: ref,
  renderKey: sha("key"),
  outputScope: "full",
  status: "renderable",
  runtime: { previewRevision: sha("preview"), modelRevision: sha("model") },
  candidates: [
    {
      candidateId: "pose",
      poseId: "pose",
      rank: 1,
      sourceBvhSha256: sha("source"),
      thumbnailUrl: root + "/pose/png",
      previewModel: {
        url: root + "/pose/glb",
        rotation: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        sourceSha: sha("source"),
        characterId: "body",
        characterSha256: sha("body"),
        modelRevision: sha("model"),
        previewRevision: sha("preview"),
      },
    },
  ],
};
const fetcher = vi.fn();
beforeEach(() => {
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
it.each([409, 401, 404])(
  "stale/unauthorized GLB %s must not start PNG fallback",
  async (status) => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "BODY_PREVIEW_STALE", message: "fixture" } }), {
        status,
      }),
    );
    await expect(
      renderBodyCandidate(manifest, manifest.candidates[0]!, new AbortController().signal),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).not.toContain("?");
  },
);
it("aborted GLB must not start expensive PNG", async () => {
  const controller = new AbortController();
  fetcher.mockImplementation(async () => {
    controller.abort();
    throw new DOMException("aborted", "AbortError");
  });
  await expect(
    renderBodyCandidate(manifest, manifest.candidates[0]!, controller.signal),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["person", "revision", "hash", "external", "camera"])(
  "rejects mismatched manifest %s",
  async (kind) => {
    const value = structuredClone(manifest);
    if (kind === "person") value.personIndex = 1;
    if (kind === "revision") value.selectionRevision = 2;
    if (kind === "hash") value.resolvedBody.assetSha256 = sha("other");
    if (kind === "external") value.candidates[0]!.thumbnailUrl = "https://other.invalid/v1/file";
    if (kind === "camera")
      value.candidates[0]!.previewModel.rotation = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ];
    fetcher.mockResolvedValue(new Response(JSON.stringify(value)));
    await expect(getManifest("job", 0, selection)).rejects.toThrow();
  },
);
it("review and FBX are bound to identical body revision and exact artifact bytes", async () => {
  const exportUrl = "/v1/pose-candidates/pose/export?jobId=job&personIndex=0&candidateId=pose";
  const headers = {
    "Content-Type": "image/png",
    "X-Standin-Review-Key": sha("review"),
    "X-Standin-Artifact-SHA256": sha("fbx"),
    "X-Standin-Body-Revision": "1",
    "X-Standin-Character-SHA256": ref.assetSha256,
  };
  fetcher.mockResolvedValueOnce(new Response("png", { headers }));
  const receipt = await loadBodyReview(
    "job",
    exportUrl,
    0,
    "pose",
    "full",
    selection,
    new AbortController().signal,
  );
  expect(receipt.downloadUrl).toContain("bodySelectionRevision=1");
  expect(receipt.downloadUrl).toContain("reviewKey=" + sha("review"));
  expect(receipt.downloadUrl).not.toContain("characterId");
  fetcher.mockResolvedValueOnce(new Response("fbx", { headers }));
  expect(new TextDecoder().decode(await downloadBodyReview(receipt))).toBe("fbx");
  fetcher.mockResolvedValueOnce(new Response("corrupted", { headers }));
  await expect(downloadBodyReview(receipt)).rejects.toThrow();
  fetcher.mockResolvedValueOnce(
    new Response("fbx", { headers: { ...headers, "X-Standin-Body-Revision": "2" } }),
  );
  await expect(downloadBodyReview(receipt)).rejects.toThrow();
});
