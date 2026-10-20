import { beforeEach, expect, it, vi } from "vitest";
import { candidateThumbnailOptions, quickCandidateThumbnailOptions } from "./candidateThumbnail";
import { apiFetchBlob } from "@/shared/api/client";
import { renderCandidate } from "../preview/renderCandidate";
vi.mock("@/shared/api/client", () => ({ apiFetchBlob: vi.fn() }));
vi.mock("../preview/renderCandidate", () => ({ renderCandidate: vi.fn() }));
const model = {
  url: "/model?job=1",
  sourceSha: "sha",
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
};
beforeEach(() => vi.resetAllMocks());
it("shows the library JPEG without starting model or Blender work", async () => {
  vi.mocked(apiFetchBlob).mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  const url = "/v1/pose-candidates/pose/thumbnail?view=front";
  const result = await quickCandidateThumbnailOptions(url).queryFn({
    signal: new AbortController().signal,
  });
  expect(result).toMatch(/^data:image\/jpeg;base64,/);
  expect(apiFetchBlob).toHaveBeenCalledTimes(1);
  expect(apiFetchBlob).toHaveBeenCalledWith(url, expect.anything());
  expect(renderCandidate).not.toHaveBeenCalled();
});
it("stops waiting for an unresponsive library image after 2.5 seconds", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(apiFetchBlob).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const request = quickCandidateThumbnailOptions("/quick").queryFn({
      signal: new AbortController().signal,
    });
    const failure = expect(request).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(2_500);
    await failure;
  } finally {
    vi.useRealTimers();
  }
});
it("renders the precomputed model without requesting a Blender PNG", async () => {
  vi.mocked(apiFetchBlob).mockResolvedValue({
    type: "model/gltf-binary",
    arrayBuffer: async () => new ArrayBuffer(1),
  } as Blob);
  vi.mocked(renderCandidate).mockResolvedValue("data:image/png;base64,fast");
  const options = candidateThumbnailOptions("/aligned?job=1", model, "female");
  expect(await options.queryFn({ signal: new AbortController().signal })).toContain("fast");
  expect(apiFetchBlob).toHaveBeenCalledTimes(1);
  expect(apiFetchBlob).toHaveBeenCalledWith("/model?job=1&characterId=female", expect.anything());
});
it("falls back to the same character PNG when GLB or WebGL fails", async () => {
  vi.mocked(apiFetchBlob).mockRejectedValueOnce(new Error("missing"));
  vi.mocked(apiFetchBlob).mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }));
  await candidateThumbnailOptions("/aligned?job=1", model, "female").queryFn({
    signal: new AbortController().signal,
  });
  expect(apiFetchBlob).toHaveBeenLastCalledWith(
    "/aligned?job=1&characterId=female",
    expect.anything(),
  );
});
it("does not start fallback work after navigation cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  vi.mocked(apiFetchBlob).mockRejectedValue(new DOMException("aborted", "AbortError"));
  await expect(
    candidateThumbnailOptions("/aligned", model).queryFn({ signal: controller.signal }),
  ).rejects.toThrow();
  expect(apiFetchBlob).toHaveBeenCalledTimes(1);
});
