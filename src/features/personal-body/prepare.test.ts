import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { finalPose, localBinding, prepareLocal, digest } from "./prepare";
import { useLocalBodies, localSelectionKey, selectedLocalModel } from "./store";
import type { LocalModel } from "./contract";
import type { ReviewItem } from "@/features/pose-viewer/hooks/useSelectionReview";
const fixtures = vi.hoisted(() => ({ fetch: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: fixtures.invoke }));
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: fixtures.fetch }));
const model: LocalModel = {
  localModelId: "00000000-0000-4000-8000-000000000001",
  name: "private name",
  sourceHash: "a".repeat(64),
  format: "fbx",
  version: 1,
  importerVersion: "1",
  normalizationVersion: "1",
  rigMappingVersion: "1",
  converterVersion: "1",
  createdAt: 1,
  updatedAt: 1,
  capabilities: { bodyPose: true, leftHand: false, rightHand: false },
};
const item = {
  personIndex: 0,
  candidate: {
    id: "candidate",
    source: "library",
    releaseAllowed: true,
    lookupAllowed: true,
    sourceBvhSha256: "c".repeat(64),
  },
  exportUrl: "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=candidate",
  refined: true,
  skipped: false,
  previewUrl: "",
} as ReviewItem;
beforeEach(() => {
  fixtures.fetch.mockReset();
  fixtures.invoke.mockReset();
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  useLocalBodies.setState({ models: [], selected: {}, scroll: {} });
});
it("uses only the selected-candidate endpoint and preserves installation authentication", async () => {
  fixtures.fetch.mockResolvedValue(new Response("HIERARCHY\nROOT root {}\nMOTION\nFrames: 1\n"));
  const result = await finalPose("job", item, new AbortController().signal);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(fixtures.fetch).toHaveBeenCalledWith(
    "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=candidate&format=bvh",
    expect.objectContaining({ auth: false }),
  );
});
it.each([
  "https://other.invalid/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=candidate",
  "/v1/pose-candidates/p/export?jobId=another&personIndex=0&candidateId=candidate",
  "/v1/pose-candidates/p/export?jobId=job&personIndex=1&candidateId=candidate",
  "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=other",
  "/refined/unsafe",
])("rejects unowned or non-final paths before requesting %s", async (exportUrl) => {
  await expect(
    finalPose("job", { ...item, exportUrl }, new AbortController().signal),
  ).rejects.toBeDefined();
  expect(fixtures.fetch).not.toHaveBeenCalled();
});
it("keeps preview-only candidates out of local conversion", async () => {
  await expect(
    finalPose(
      "job",
      { ...item, candidate: { ...item.candidate, releaseAllowed: false } },
      new AbortController().signal,
    ),
  ).rejects.toBeDefined();
  expect(fixtures.fetch).not.toHaveBeenCalled();
});
it("rejects a JSON response instead of treating it as a pose", async () => {
  fixtures.fetch.mockResolvedValue(new Response('{"error":"failed"}'));
  await expect(finalPose("job", item, new AbortController().signal)).rejects.toBeDefined();
});
it("changes prepared identity for replacement, pose, hands, scope and converter, but not renaming", () => {
  const binding = localBinding(model, item, "full", { left: "open", right: "fist", revision: 1 });
  expect(
    localBinding({ ...model, name: "renamed" }, item, "full", {
      left: "open",
      right: "fist",
      revision: 1,
    }),
  ).toBe(binding);
  for (const changed of [
    { ...model, version: 2 },
    { ...model, sourceHash: "b".repeat(64) },
    { ...model, converterVersion: "2" },
  ])
    expect(
      localBinding(changed, item, "full", { left: "open", right: "fist", revision: 1 }),
    ).not.toBe(binding);
  expect(
    localBinding(model, { ...item, exportUrl: item.exportUrl + "&revision=2" }, "full", {
      left: "open",
      right: "fist",
      revision: 1,
    }),
  ).not.toBe(binding);
  expect(localBinding(model, item, "full", { left: "fist", right: "fist", revision: 2 })).not.toBe(
    binding,
  );
  expect(localBinding(model, item, "bust", { left: "open", right: "fist", revision: 1 })).not.toBe(
    binding,
  );
});
it("shares per-person choices across surfaces and removes deleted choices", () => {
  const state = useLocalBodies.getState();
  state.setModels([model]);
  state.select(localSelectionKey("job", 0), model.localModelId);
  expect(selectedLocalModel("job", 0)).toEqual(model);
  expect(selectedLocalModel("job", 1)).toBeUndefined();
  expect(selectedLocalModel("other", 0)).toBeUndefined();
  state.setModels([]);
  expect(selectedLocalModel("job", 0)).toBeUndefined();
});

const rotatedItem = (): ReviewItem => ({
  ...item,
  candidate: {
    ...item.candidate,
    previewModel: {
      url: "/v1/preview",
      sourceSha: "c".repeat(64),
      rotation: [
        [0, 0, 1],
        [0, 1, 0],
        [-1, 0, 0],
      ],
    },
  },
});
it("binds selected source-camera lineage and matrix, and sends it to actual native export", async () => {
  const current = rotatedItem();
  expect(localBinding(model, current, "full", undefined)).not.toBe(
    localBinding(model, item, "full", undefined),
  );
  fixtures.fetch.mockResolvedValue(new Response("HIERARCHY\nROOT root {}\nMOTION\nFrames: 1\n"));
  const content = new Uint8Array([1, 2, 3]);
  fixtures.invoke.mockResolvedValue({
    contentBase64: btoa(String.fromCharCode(...content)),
    snapshotHash: "d".repeat(64),
    artifactHash: await digest(content),
  });
  await prepareLocal(
    "job",
    model,
    current,
    "full",
    localBinding(model, current, "full", undefined),
    new AbortController().signal,
  );
  expect(fixtures.invoke).toHaveBeenCalledWith(
    "personal_body_apply",
    expect.objectContaining({
      request: expect.objectContaining({
        camera: {
          version: "personal-camera/1",
          sourceBvhSha256: "c".repeat(64),
          rotation: current.candidate.previewModel!.rotation,
        },
      }),
    }),
  );
});
it("rejects malformed or wrong-source camera without downloading or converting", async () => {
  for (const over of [
    {
      rotation: [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    { sourceSha: "e".repeat(64) },
  ]) {
    const current = rotatedItem();
    Object.assign(current.candidate.previewModel!, over);
    await expect(
      prepareLocal("job", model, current, "full", "binding", new AbortController().signal),
    ).rejects.toMatchObject({ code: "CAMERA_UNSUPPORTED" });
  }
  expect(fixtures.fetch).not.toHaveBeenCalled();
  expect(fixtures.invoke).not.toHaveBeenCalled();
});
it("discards an in-flight artifact when only camera rotation changes", async () => {
  const current = rotatedItem();
  fixtures.fetch.mockResolvedValue(new Response("HIERARCHY\nROOT root {}"));
  let finish: (value: unknown) => void = () => {};
  fixtures.invoke.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const prepared = prepareLocal(
    "job",
    model,
    current,
    "full",
    localBinding(model, current, "full", undefined),
    new AbortController().signal,
  );
  const rejection = expect(prepared).rejects.toMatchObject({ code: "STALE_RESULT" });
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(fixtures.invoke).toHaveBeenCalled());
  current.candidate.previewModel!.rotation = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  finish({ contentBase64: "AQ==", snapshotHash: "d".repeat(64), artifactHash: "e".repeat(64) });
  await rejection;
});

it("preserves the server camera even when no GLB URL was supplied", async () => {
  const { personalCamera } = await import("./camera");
  const current = {
    ...item,
    candidate: {
      ...item.candidate,
      presentationCamera: {
        version: "candidate-camera-v2",
        sourceBvhSha256: "c".repeat(64),
        rotation: [
          [0, 0, 1],
          [0, 1, 0],
          [-1, 0, 0],
        ],
      },
    },
  };
  expect(personalCamera(current)).toMatchObject({
    rotation: [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0],
    ],
  });
  expect(localBinding(model, current, "full", null)).not.toBe(
    localBinding(model, item, "full", null),
  );
  const unsupported = {
    ...current,
    candidate: {
      ...current.candidate,
      presentationCamera: { ...current.candidate.presentationCamera, version: "unknown" },
    },
  };
  expect(() => localBinding(model, unsupported, "full", null)).not.toThrow(); // UI gets a recoverable query error.
  expect(() => personalCamera(unsupported)).toThrow();
});
it("rejects a changed base BVH before assigning the original search camera", async () => {
  fixtures.fetch.mockResolvedValue(new Response("HIERARCHY\nchanged bytes"));
  await expect(
    finalPose("job", { ...item, refined: false }, new AbortController().signal),
  ).rejects.toMatchObject({ code: "STALE_RESULT" });
});
