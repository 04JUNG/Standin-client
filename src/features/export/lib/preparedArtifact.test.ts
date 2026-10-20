import { beforeEach, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { apiFetchResponse } from "@/shared/api/client";
import { loadPreparedImage, preparedIdentity, preparedUrl } from "./preparedArtifact";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const key = "a".repeat(64);
const download = `/v1/pose-candidates/p/framed?jobId=j&artifactReceipt=${key}&format=fbx`;
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function response(change: Record<string, string> = {}, bytes = png) {
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "X-Standin-Artifact-Contract": "verified-fbx-v1",
      "X-Standin-Review-Key": key,
      "X-Standin-Artifact-SHA256": "b".repeat(64),
      "X-Standin-Character-SHA256": "c".repeat(64),
      "X-Standin-Source-BVH-SHA256": "d".repeat(64),
      "X-Standin-Preview-Artifact-SHA256": hash(png),
      ...change,
    },
  });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
});
it("a follow-up image names the same prepared receipt and verifies its bytes", async () => {
  vi.mocked(apiFetchResponse).mockResolvedValue(response());
  expect(await loadPreparedImage(download, new AbortController().signal)).toMatch(
    /^data:image\/png/,
  );
  expect(vi.mocked(apiFetchResponse).mock.calls[0]![0]).toContain("format=preview");
  expect(preparedUrl(download, key, "fbx")).toContain(`reviewKey=${key}`);
});
const invalidHeaders: Record<string, string>[] = [
  { "X-Standin-Artifact-Contract": "old" },
  { "X-Standin-Review-Key": "e".repeat(64) },
  { "X-Standin-Character-SHA256": "invalid" },
  { "X-Standin-Preview-Artifact-SHA256": "f".repeat(64) },
];
it.each(invalidHeaders)("rejects stale receipts and corrupt image hashes", async (headers) => {
  vi.mocked(apiFetchResponse).mockResolvedValue(response(headers));
  await expect(loadPreparedImage(download, new AbortController().signal)).rejects.toThrow();
});
it("late aborted image responses cannot become current", async () => {
  const controller = new AbortController();
  controller.abort();
  vi.mocked(apiFetchResponse).mockResolvedValue(response());
  await expect(loadPreparedImage(download, controller.signal)).rejects.toThrow();
  expect(preparedIdentity(response()).artifactSha256).toBe("b".repeat(64));
});
