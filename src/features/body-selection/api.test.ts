import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { ApiError } from "@/shared/api/errors";
import { getManifest, getOptions, renderBodyCandidate } from "./api";
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
const renderMesh = vi.hoisted(() => vi.fn());
vi.mock("@/features/pose-viewer/preview/renderCandidate", () => ({ renderCandidate: renderMesh }));
vi.mock("@/features/pose-viewer/api/thumbnails", () => ({
  blobToDataUrl: async () => "verified-png",
}));
beforeEach(() => {
  fetcher.mockReset();
  renderMesh.mockReset().mockResolvedValue("verified-glb");
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
});
afterEach(() => vi.unstubAllGlobals());

function assetResponse(m: BodyManifest, type: string, data = "asset") {
  return new Response(data, {
    headers: {
      "Content-Type": type,
      "X-Standin-Body-Render-Key": m.renderKey,
      "X-Standin-Body-Revision": String(m.selectionRevision),
      "X-Standin-Character-SHA256": m.resolvedBody.assetSha256,
      "X-Standin-Source-BVH-SHA256": m.candidates[0]!.sourceBvhSha256,
      "X-Standin-Preview-Revision": m.runtime.previewRevision,
      "X-Standin-Model-Revision": m.runtime.modelRevision,
      "X-Standin-Artifact-SHA256": sha(data),
    },
  });
}
it.each(["full", "half", "bust", "head"] as const)(
  "accepts %s and passes its model contract to the renderer",
  async (scope) => {
    const m = { ...manifest, outputScope: scope };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(m)));
    expect((await getManifest("job", 0, selection)).outputScope).toBe(scope);
    fetcher.mockResolvedValueOnce(assetResponse(m, "model/gltf-binary"));
    expect(await renderBodyCandidate(m, m.candidates[0]!, new AbortController().signal)).toBe(
      "verified-glb",
    );
    expect(renderMesh.mock.calls[0]![1]).toMatchObject({
      scope,
      version: scope === "full" ? "posed-mesh-v1" : "framed-mesh-v1",
      characterSha256: ref.assetSha256,
    });
  },
);
it("rejects missing or unsupported manifest scopes", async () => {
  for (const scope of [undefined, "waist", "invalid"]) {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...manifest, outputScope: scope })),
    );
    await expect(getManifest("job", 0, selection)).rejects.toThrow();
  }
});
it("half scope with a changed body revision uses the same verified PNG fallback", async () => {
  const m: BodyManifest = {
    ...manifest,
    outputScope: "half",
    selectionRevision: 7,
    renderKey: sha("new-body"),
  };
  fetcher.mockResolvedValueOnce(new Response("", { status: 503 }));
  fetcher.mockResolvedValueOnce(assetResponse(m, "image/png"));
  expect(await renderBodyCandidate(m, m.candidates[0]!, new AbortController().signal)).toBe(
    "verified-png",
  );
  expect(fetcher.mock.calls[1]![0]).toContain("/png");
  expect(renderMesh).not.toHaveBeenCalled();
});
it("half PNG from a previous body revision is rejected", async () => {
  const m = { ...manifest, outputScope: "half" as const, selectionRevision: 2 };
  fetcher.mockResolvedValueOnce(new Response("", { status: 503 }));
  fetcher.mockResolvedValueOnce(assetResponse(manifest, "image/png"));
  await expect(
    renderBodyCandidate(m, m.candidates[0]!, new AbortController().signal),
  ).rejects.toThrow("버전");
});
it("removes six fixed adult bodies from options while retaining shape-key bodies and teens", async () => {
  const ids = [
    "body-female-athletic",
    "body-female-base",
    "body-female-muscular",
    "body-male-athletic",
    "body-male-base",
    "body-male-muscular",
    "female-base-v0-3-4",
    "male-base-v0-7-2",
    "body-teen-female",
  ];
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        catalogRevision: "test",
        characters: ids.map((characterId) => ({
          characterId,
          bodyRef: { ...ref, characterId },
          selectable: true,
          reasonCodes: [],
        })),
      }),
    ),
  );
  expect((await getOptions("job", 0)).characters.map((c) => c.characterId)).toEqual([
    "female-base-v0-3-4",
    "male-base-v0-7-2",
    "body-teen-female",
  ]);
});
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

it("accepts shoulder/head manifest and binds optional scope and selected hand receipts", async () => {
  const scoped = { ...manifest, outputScope: "shoulder_head" as const };
  fetcher.mockResolvedValueOnce(Response.json(scoped));
  expect((await getManifest("job", 0, selection)).outputScope).toBe("shoulder_head");
  const m = { ...manifest, hands: { revision: 2, library_sha256: sha("hands") } };
  const candidate = m.candidates[0]!;
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const headers = {
    "Content-Type": "image/png",
    "X-Standin-Body-Render-Key": m.renderKey,
    "X-Standin-Body-Revision": "1",
    "X-Standin-Character-SHA256": ref.assetSha256,
    "X-Standin-Source-BVH-SHA256": candidate.sourceBvhSha256,
    "X-Standin-Preview-Revision": m.runtime.previewRevision,
    "X-Standin-Model-Revision": m.runtime.modelRevision,
    "X-Standin-Artifact-SHA256": createHash("sha256").update(png).digest("hex"),
    "X-Standin-Output-Scope": "full",
    "X-Standin-Hand-Revision": "2",
    "X-Standin-Hand-Library-SHA256": sha("hands"),
  };
  fetcher
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(png, { headers }));
  expect(await renderBodyCandidate(m, candidate, new AbortController().signal)).toBe(
    "verified-png",
  );
  fetcher
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(
      new Response(png, { headers: { ...headers, "X-Standin-Output-Scope": "half" } }),
    );
  await expect(renderBodyCandidate(m, candidate, new AbortController().signal)).rejects.toThrow();
});
