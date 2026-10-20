import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { downloadScene, sceneReference } from "./scene";
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
