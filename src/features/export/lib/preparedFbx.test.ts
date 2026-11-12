import { beforeEach, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { apiFetchResponse } from "@/shared/api/client";
import { loadPreparedFbx, fetchPreparedFbxResponse, forgetPreparedFbx } from "./preparedFbx";
import { preparedFile } from "./preparedArtifact";
const m = vi.hoisted(() => ({ owner: "owner" }));
vi.mock("@/shared/api/client", () => ({
  apiFetchResponse: vi.fn(),
  currentInstallationId: () => m.owner,
}));
const bytes = new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0test fixture");
const digest = createHash("sha256").update(bytes).digest("hex");
const receipt = "a".repeat(64);
const url = `/v1/pose-candidates/p/framed?jobId=j&personIndex=0&candidateId=p&format=fbx&artifactReceipt=${receipt}&reviewKey=${receipt}`;
function response(headers: Record<string, string> = {}, body: Uint8Array | null = bytes) {
  return new Response(body ? (body.slice().buffer as ArrayBuffer) : null, {
    headers: {
      "X-Standin-Local-Preview": "fbx-v1",
      "X-Standin-Artifact-Contract": "verified-fbx-v1",
      "X-Standin-Review-Key": receipt,
      "X-Standin-Artifact-SHA256": digest,
      "X-Standin-Character-SHA256": "b".repeat(64),
      "X-Standin-Source-BVH-SHA256": "c".repeat(64),
      "X-Standin-Output-Scope": "full",
      "X-Standin-Body-Revision": "2",
      "X-Standin-Hand-Revision": "3",
      "X-Standin-Hand-Library-SHA256": "d".repeat(64),
      ...headers,
    },
  });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  m.owner = "owner";
  forgetPreparedFbx("j");
  vi.mocked(apiFetchResponse)
    .mockReset()
    .mockImplementation(async () => response());
});
it("loads the exact verified FBX without requesting a PNG, then saves with HEAD only", async () => {
  expect(
    Array.from(
      new Uint8Array(
        await loadPreparedFbx(url, preparedFile(response())!, new AbortController().signal),
      ),
    ),
  ).toEqual(Array.from(bytes));
  expect(vi.mocked(apiFetchResponse).mock.calls[0]![0]).toContain("format=review-fbx");
  expect(vi.mocked(apiFetchResponse).mock.calls[0]![0]).not.toContain("format=preview");
  const saved = await fetchPreparedFbxResponse(url);
  expect(Array.from(new Uint8Array(await saved.arrayBuffer()))).toEqual(Array.from(bytes));
  expect(vi.mocked(apiFetchResponse).mock.calls[1]![1]?.method).toBe("HEAD");
});
it.each([
  "X-Standin-Artifact-SHA256",
  "X-Standin-Review-Key",
  "X-Standin-Character-SHA256",
  "X-Standin-Source-BVH-SHA256",
  "X-Standin-Body-Revision",
  "X-Standin-Hand-Revision",
  "X-Standin-Output-Scope",
])("rejects changed %s during preview and save", async (name) => {
  const file = preparedFile(response())!;
  vi.mocked(apiFetchResponse).mockResolvedValue(response({ [name]: "e".repeat(64) }));
  await expect(loadPreparedFbx(url, file, new AbortController().signal)).rejects.toThrow();
  vi.mocked(apiFetchResponse).mockResolvedValue(response());
  await loadPreparedFbx(url, file, new AbortController().signal);
  vi.mocked(apiFetchResponse).mockResolvedValue(response({ [name]: "e".repeat(64) }, null));
  await expect(fetchPreparedFbxResponse(url)).rejects.toThrow();
});
it("never uses cached bytes after server revocation", async () => {
  await loadPreparedFbx(url, preparedFile(response())!, new AbortController().signal);
  vi.mocked(apiFetchResponse).mockRejectedValue(new Error("access denied"));
  await expect(fetchPreparedFbxResponse(url)).rejects.toThrow("access denied");
});
it("isolates owners and clears invalidated jobs", async () => {
  await loadPreparedFbx(url, preparedFile(response())!, new AbortController().signal);
  m.owner = "another-owner";
  await fetchPreparedFbxResponse(url);
  expect(vi.mocked(apiFetchResponse).mock.lastCall?.[1]?.method).toBeUndefined();
  m.owner = "owner";
  forgetPreparedFbx("j");
  await fetchPreparedFbxResponse(url);
  expect(vi.mocked(apiFetchResponse).mock.lastCall?.[1]?.method).toBeUndefined();
});
it("rejects corrupt, oversized, and late aborted bytes without caching", async () => {
  const file = preparedFile(response())!;
  vi.mocked(apiFetchResponse).mockResolvedValue(response({}, new Uint8Array([1])));
  await expect(loadPreparedFbx(url, file, new AbortController().signal)).rejects.toThrow();
  vi.mocked(apiFetchResponse).mockResolvedValue(
    response({ "Content-Length": String(31 * 1024 * 1024) }),
  );
  await expect(loadPreparedFbx(url, file, new AbortController().signal)).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  vi.mocked(apiFetchResponse).mockResolvedValue(response());
  await expect(loadPreparedFbx(url, file, controller.signal)).rejects.toThrow();
  await fetchPreparedFbxResponse(url);
  expect(vi.mocked(apiFetchResponse).mock.lastCall?.[1]?.method).toBeUndefined();
});
it("a legacy server does not advertise local FBX preview", () => {
  expect(preparedFile(new Response())).toBeUndefined();
});
