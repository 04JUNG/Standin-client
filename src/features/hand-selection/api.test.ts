import { beforeEach, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { selection } from "./fixtures";
const mocks = vi.hoisted(() => ({ response: vi.fn(), json: vi.fn() }));
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: mocks.response, apiFetch: mocks.json }));
import { handReviewFromResponse, downloadHandReview, putHandSelection } from "./api";
const bytes = new Uint8Array([1, 2, 3]);
const headers = {
  "X-Standin-Hand-Revision": "0",
  "X-Standin-Hand-Library-SHA256": selection.library_sha256,
  "X-Standin-Review-Key": "b".repeat(64),
  "X-Standin-Artifact-SHA256": createHash("sha256").update(bytes).digest("hex"),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
});
it("pins the hand revision and review key and verifies downloaded bytes", async () => {
  const receipt = handReviewFromResponse(
    new Response(null, { headers }),
    selection,
    "/v1/pose-candidates/p/framed?format=fbx",
  );
  expect(receipt.downloadUrl).toContain("handSelectionRevision=0");
  expect(receipt.downloadUrl).toContain("reviewKey=");
  mocks.response.mockResolvedValue(new Response(bytes, { headers }));
  expect(await downloadHandReview(receipt)).toEqual(bytes);
  mocks.response.mockResolvedValue(
    new Response(bytes, { headers: { ...headers, "X-Standin-Hand-Revision": "1" } }),
  );
  await expect(downloadHandReview(receipt)).rejects.toThrow("확인한 손과 파일이 다릅니다");
  mocks.response.mockResolvedValue(new Response(new Uint8Array([9]), { headers }));
  await expect(downloadHandReview(receipt)).rejects.toThrow("변경되었습니다");
});
it("rejects a preview made for a different hand selection", () => {
  expect(() =>
    handReviewFromResponse(
      new Response(null, { headers: { ...headers, "X-Standin-Hand-Revision": "3" } }),
      selection,
      "/fbx",
    ),
  ).toThrow();
});
it("saves a partial side patch with a library hash and optimistic revision", async () => {
  mocks.json.mockResolvedValue({ ...selection, right: "fist", revision: 1, changed: ["right"] });
  await putHandSelection("job", selection, { right: "fist" });
  expect(mocks.json).toHaveBeenCalledWith(
    "/v1/analysis/jobs/job/people/0/hands",
    expect.objectContaining({
      method: "PUT",
      body: { right: "fist", library_sha256: selection.library_sha256, expectedRevision: 0 },
    }),
  );
});
