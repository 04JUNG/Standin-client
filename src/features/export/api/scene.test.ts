import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  downloadScene,
  prepareScene,
  sceneReference,
  loadScenePreview,
  readSceneSaveContract,
} from "./scene";
import { sceneReviewFixture, sceneContractFixture } from "./scene.fixtures";
import { apiFetchResponse } from "@/shared/api/client";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
vi.stubGlobal("crypto", webcrypto);
afterEach(() => vi.resetAllMocks());
const fbx = new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0scene");
const refs = () =>
  Promise.all([0, 1].map((i) => sceneReference(i, `p${i}`, `/framed?personIndex=${i}`, fbx)));
async function response(count = "2", version = "rough-layout-v1", bad = false) {
  const [ref] = await refs();
  return new Response(bad ? new Uint8Array([1, 2, 3]) : fbx, {
    headers: {
      "X-Standin-Artifact-SHA256": ref!.sha256,
      "X-Standin-Person-Count": count,
      "X-Standin-Scene-Version": version,
      "X-Standin-Scene-Contract": "scene-save-v1",
      "X-Standin-Scene-Save-Mode":
        version === "rough-layout-v1" ? "original-selection" : "auto-correct-v4",
    },
  });
}
async function review() {
  return { ...sceneReviewFixture(), artifactSha256: (await refs())[0]!.sha256 };
}
describe("scene contract and artifact verification (local fixtures)", () => {
  it("keeps the legacy original-selection request", async () => {
    const persons = await refs();
    vi.mocked(apiFetchResponse).mockResolvedValue(await response());
    expect(Array.from(await downloadScene("job", persons))).toEqual(Array.from(fbx));
    expect(apiFetchResponse).toHaveBeenCalledWith("/v1/analysis/jobs/job/scene", {
      method: "POST",
      auth: false,
      body: { persons },
    });
  });
  it("negotiates original-selection explicitly without preparing correction", async () => {
    const persons = await refs();
    vi.mocked(apiFetchResponse).mockResolvedValue(await response());
    await downloadScene("job", persons, undefined, { negotiated: true });
    expect(apiFetchResponse).toHaveBeenCalledOnce();
    expect(apiFetchResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: { persons, contractVersion: "scene-save-v1", saveMode: "original-selection" },
      }),
    );
  });
  it.each([
    ["1", "rough-layout-v1", false],
    ["2", "unknown", false],
    ["2", "rough-layout-v1", true],
  ])("rejects count, protocol or byte substitution", async (count, version, bad) => {
    vi.mocked(apiFetchResponse).mockResolvedValue(
      await response(count as string, version as string, bad as boolean),
    );
    await expect(downloadScene("job", await refs())).rejects.toMatchObject({
      code: "SCENE_INTEGRITY",
    });
  });
  it("prepares with explicit mode, then pins review version and SHA on save", async () => {
    const persons = await refs();
    const receipt = await review();
    const signal = new AbortController().signal;
    vi.mocked(apiFetchResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
      .mockResolvedValueOnce(await response("2", receipt.version));
    const prepared = await prepareScene("job", persons, signal);
    expect(apiFetchResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal,
        body: {
          contractVersion: "scene-save-v1",
          saveMode: "auto-correct-v4",
          persons,
          prepare: true,
          artifactOnly: true,
        },
      }),
    );
    expect(Array.from(await downloadScene("job", persons, prepared, { signal }))).toEqual(
      Array.from(fbx),
    );
    expect(apiFetchResponse).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal,
        body: {
          persons,
          contractVersion: "scene-save-v1",
          saveMode: "auto-correct-v4",
          reviewVersion: "scene-review-v1",
          reviewKey: receipt.reviewKey,
          artifactSha256: receipt.artifactSha256,
        },
      }),
    );
  });
  it.each(["reviewed-sha", "mode-header", "contract-header"])(
    "blocks %s substitution",
    async (kind) => {
      const receipt = await review();
      const res = await response("2", receipt.version);
      if (kind === "reviewed-sha") receipt.artifactSha256 = "0".repeat(64);
      if (kind === "mode-header")
        res.headers.set("X-Standin-Scene-Save-Mode", "original-selection");
      if (kind === "contract-header") res.headers.delete("X-Standin-Scene-Contract");
      vi.mocked(apiFetchResponse).mockResolvedValue(res);
      await expect(downloadScene("job", await refs(), receipt)).rejects.toMatchObject({
        code: "SCENE_INTEGRITY",
      });
    },
  );
  it.each(["expired", "summary-person", "review-version", "scope", "missing-change"])(
    "rejects malformed prepare: %s",
    async (kind) => {
      const receipt = await review();
      if (kind === "expired") receipt.expiresAt = "2000-01-01T00:00:00.000Z";
      if (kind === "summary-person") receipt.summary[0]!.personIndex = 1;
      if (kind === "review-version") Object.assign(receipt, { reviewVersion: "future" });
      if (kind === "scope") Object.assign(receipt.summary[0]!, { outputScope: "invalid" });
      if (kind === "missing-change") Object.assign(receipt.summary[0]!, { poseChanged: undefined });
      vi.mocked(apiFetchResponse).mockResolvedValue(new Response(JSON.stringify(receipt)));
      await expect(prepareScene("job", await refs())).rejects.toMatchObject({
        code: kind === "expired" ? "SCENE_REVIEW_EXPIRED" : "SCENE_INTEGRITY",
      });
    },
  );
  it("expires before confirmation without making a save request", async () => {
    await expect(
      downloadScene("job", await refs(), {
        ...(await review()),
        expiresAt: "2000-01-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "SCENE_REVIEW_EXPIRED" });
    expect(apiFetchResponse).not.toHaveBeenCalled();
  });
  it("rejects a preview of another artifact", async () => {
    vi.mocked(apiFetchResponse).mockResolvedValue(
      new Response("", { headers: { "X-Standin-Artifact-SHA256": "0".repeat(64) } }),
    );
    await expect(
      loadScenePreview("job", await refs(), await review(), new AbortController().signal),
    ).rejects.toMatchObject({ code: "SCENE_INTEGRITY" });
  });
  it("accepts only the supported capability contract", () => {
    expect(readSceneSaveContract(sceneContractFixture)).toEqual(sceneContractFixture);
    expect(readSceneSaveContract({ ...sceneContractFixture, version: "future" })).toBeUndefined();
    expect(readSceneSaveContract(undefined)).toBeUndefined();
  });
});

it("malformed preparation JSON is a scene integrity error", async () => {
  vi.mocked(apiFetchResponse).mockResolvedValue(new Response("not-json"));
  await expect(prepareScene("job", await refs())).rejects.toMatchObject({
    code: "SCENE_INTEGRITY",
  });
});
