import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { downloadScene, prepareScene, sceneReference } from "./scene";
import { apiFetchResponse } from "@/shared/api/client";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
vi.stubGlobal("crypto", webcrypto);
afterEach(() => vi.clearAllMocks());
const fbx = new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0scene");
async function response(count = "2", version = "rough-layout-v1", bad = false) {
  const ref = await sceneReference(0, "pick", "/v1/pose-candidates/a/framed", fbx);
  return new Response(bad ? new Uint8Array([1, 2, 3]) : fbx, {
    headers: {
      "X-Standin-Artifact-SHA256": ref.sha256,
      "X-Standin-Person-Count": count,
      "X-Standin-Scene-Version": version,
    },
  });
}
describe("scene save", () => {
  it("passes reviewed identity and verifies the combined binary before native save", async () => {
    const refs = await Promise.all(
      [0, 1].map((i) =>
        sceneReference(i, `p${i}`, `/v1/pose-candidates/a/framed?personIndex=${i}`, fbx),
      ),
    );
    vi.mocked(apiFetchResponse).mockResolvedValue(await response());
    expect(Array.from(await downloadScene("job", refs))).toEqual(Array.from(fbx));
    expect(apiFetchResponse).toHaveBeenCalledWith("/v1/analysis/jobs/job/scene", {
      method: "POST",
      auth: false,
      body: { persons: refs },
    });
  });
  it.each([
    ["1", "rough-layout-v1", false],
    ["2", "unknown", false],
    ["2", "rough-layout-v1", true],
  ])("rejects count, protocol or artifact substitution", async (count, version, bad) => {
    vi.mocked(apiFetchResponse).mockResolvedValue(await response(count, version, bad));
    await expect(downloadScene("job", [{}, {}] as never)).rejects.toThrow();
  });
});

it("new scene preview is verified and the confirmed download must match that artifact", async () => {
  const refs = await Promise.all(
    [0, 1].map((i) => sceneReference(i, "pick", "/v1/pose-candidates/a/framed", fbx)),
  );
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const preview = await sceneReference(0, "pick", "/", png);
  const review = {
    version: "scene-refinement-v4",
    reviewKey: "a".repeat(48),
    artifactSha256: refs[0]!.sha256,
    previewSha256: preview.sha256,
    previewBase64: btoa(String.fromCharCode(...png)),
    personCount: 2,
    summary: [],
  };
  vi.mocked(apiFetchResponse)
    .mockResolvedValueOnce(new Response(JSON.stringify(review)))
    .mockResolvedValueOnce(await response("2", "scene-refinement-v4"));
  const prepared = await prepareScene("job", refs);
  expect(Array.from(await downloadScene("job", refs, prepared))).toEqual(Array.from(fbx));
  expect(apiFetchResponse).toHaveBeenLastCalledWith(
    "/v1/analysis/jobs/job/scene",
    expect.objectContaining({ body: { persons: refs, reviewKey: review.reviewKey } }),
  );
  vi.mocked(apiFetchResponse).mockResolvedValue(await response("2", "scene-refinement-v4"));
  await expect(
    downloadScene("job", refs, { ...prepared, artifactSha256: "0".repeat(64) }),
  ).rejects.toThrow();
  vi.mocked(apiFetchResponse).mockResolvedValue(
    new Response(JSON.stringify({ ...review, previewSha256: "0".repeat(64) })),
  );
  await expect(prepareScene("job", refs)).rejects.toThrow();
});
