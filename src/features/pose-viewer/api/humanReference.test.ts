import { expect, it, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { apiFetchResponse } from "@/shared/api/client";
import { humanFixture, bvhFixture } from "@/test/humanReferenceFixture";
import { loadHumanReference, loadHumanTemplate } from "./humanReference";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));

const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const source =
  "/v1/pose-candidates/pose/poster-source?jobId=owned&personIndex=0&candidateId=c&scope=full";
function sourceResponse(text = bvhFixture(), hash = sha(text)) {
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain",
      "X-Standin-Source-BVH-SHA256": hash,
      "X-Standin-Output-Scope": "full",
      "X-Standin-Preview-Only": "true",
    },
  });
}
beforeEach(() => {
  vi.mocked(apiFetchResponse).mockReset();
});
it("rejects changed source before fetching shared mesh or rendering and rejects external paths", async () => {
  vi.mocked(apiFetchResponse).mockResolvedValue(sourceResponse("changed", sha(bvhFixture())));
  await expect(
    loadHumanReference(source, sha(bvhFixture()), "full", new AbortController().signal),
  ).rejects.toThrow("BVH");
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  await expect(
    loadHumanReference(
      "https://outside.invalid/bvh",
      undefined,
      "full",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
it("shares one approved actual-human template across exact-source cards and uses no Converter", async () => {
  const t = humanFixture(),
    json = Buffer.from(JSON.stringify(t)),
    packed = gzipSync(json);
  vi.mocked(apiFetchResponse).mockImplementation(async (path) =>
    String(path).includes("default-body-template")
      ? new Response(json, {
          headers: {
            "Content-Type": "application/json",
            "X-Standin-Template-Version": t.version,
            "X-Standin-Output-Scope": "full",
            "X-Standin-Preview-Only": "true",
            "X-Standin-Preview-Method": "reference-skinning-v1",
            "X-Standin-Character-Id": t.character_id,
            "X-Standin-Character-SHA256": t.character_sha256,
            "X-Standin-Template-SHA256": sha(packed),
            "X-Standin-Artifact-SHA256": sha(json),
            "X-Standin-Template-JSON-SHA256": sha(json),
          },
        })
      : sourceResponse(),
  );
  const responses = await Promise.all([
    loadHumanTemplate("full", new AbortController().signal),
    loadHumanTemplate("full", new AbortController().signal),
  ]);
  expect(responses[0]).toBe(responses[1]);
  expect(responses[0].character_sha256).toBe(t.character_sha256);
  expect(
    vi
      .mocked(apiFetchResponse)
      .mock.calls.filter(([p]) => String(p).includes("default-body-template")),
  ).toHaveLength(1);
  expect(
    vi
      .mocked(apiFetchResponse)
      .mock.calls.every(
        ([p]) => String(p).includes("poster-source") || String(p).includes("default-body-template"),
      ),
  ).toBe(true);
});
