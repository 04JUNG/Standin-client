import { beforeEach, expect, it, vi } from "vitest";
import { apiFetchResponse } from "@/shared/api/client";
import { loadPosePoster } from "./posePoster";
import { POSTER_URL, POSTER_SOURCE, posterResponse } from "@/test/posePosterFixture";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
beforeEach(() => {
  vi.mocked(apiFetchResponse).mockReset();
});
it("never returns a skeleton as completed human preview, including direct review consumers", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(async (url) =>
    String(url).includes("/poster-source?")
      ? new Response("changed", {
          headers: {
            "X-Standin-Source-BVH-SHA256": POSTER_SOURCE,
            "X-Standin-Output-Scope": "full",
            "X-Standin-Preview-Only": "true",
          },
        })
      : posterResponse({
          "X-Standin-Poster-Kind": "pose-only",
          "X-Standin-Character-Id": "none",
          "X-Standin-Character-SHA256": "none",
          "X-Standin-Preview-Method": "pose-only",
        }),
  );
  await expect(
    loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE),
  ).rejects.toThrow("BVH");
  expect(apiFetchResponse).toHaveBeenCalledTimes(2);
  expect(String(vi.mocked(apiFetchResponse).mock.calls[1][0])).toContain("/poster-source?");
});
it("rejects unknown preview methods and changed reference body before any fallback request", async () => {
  const cases: Record<string, string>[] = [
    { "X-Standin-Preview-Method": "invented" },
    {
      "X-Standin-Preview-Method": "reference-skinning-v1",
      "X-Standin-Template-SHA256": "c".repeat(64),
    },
  ];
  for (const fields of cases) {
    vi.mocked(apiFetchResponse).mockClear();
    vi.mocked(apiFetchResponse).mockImplementation(() => posterResponse(fields));
    await expect(
      loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE),
    ).rejects.toThrow();
    expect(apiFetchResponse).toHaveBeenCalledOnce();
  }
});
it("exposes the approximate reference method only for actual approved human poster lineage", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(() =>
    posterResponse({
      "X-Standin-Preview-Method": "reference-skinning-v1",
      "X-Standin-Template-SHA256": "c".repeat(64),
      "X-Standin-Character-SHA256":
        "7c648b97a24a3bb4914b6e5d515708c33727979881d92ef916d5726e22301f3d",
    }),
  );
  const poster = await loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE);
  expect(poster.kind).toBe("default-body");
  expect(poster.method).toBe("reference-skinning-v1");
});

it("saved-only semantic lists reject a skeleton without fetching BVH or starting a render", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(() =>
    posterResponse({
      "X-Standin-Poster-Kind": "pose-only",
      "X-Standin-Character-Id": "none",
      "X-Standin-Character-SHA256": "none",
      "X-Standin-Preview-Method": "pose-only",
    }),
  );
  await expect(
    loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE, "full", false),
  ).rejects.toThrow("저장된");
  expect(apiFetchResponse).toHaveBeenCalledOnce();
});

it("decodes a source-bound directional JPEG with the actual served angle and never runs a model fallback", async () => {
  const bytes = new Uint8Array([255, 216, 255, 12]);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const headers = (
    await posterResponse({
      "Content-Type": "image/jpeg",
      "X-Standin-Preview-Method": "frozen-native-scope8-v1",
      "X-Standin-Character-SHA256":
        "7c648b97a24a3bb4914b6e5d515708c33727979881d92ef916d5726e22301f3d",
      "X-Standin-Poster-Variant": "rough-yaw8-v1",
      "X-Standin-Poster-Asset-Version": "scope8-v1",
      "X-Standin-Asset-Library-Version": "lib-20261021-12345678",
      "X-Standin-Poster-Yaw": "45",
      "X-Standin-Poster-Requested-Yaw": "30",
      "X-Standin-Poster-Camera-Source": "fixed_117",
      "X-Standin-Poster-Fallback": "none",
      "X-Standin-Projection-Matches-Search": "false",
      "X-Standin-Artifact-SHA256": sha,
    })
  ).headers;
  vi.mocked(apiFetchResponse).mockImplementation(async () => new Response(bytes, { headers }));
  const poster = await loadPosePoster(
    POSTER_URL,
    new AbortController().signal,
    POSTER_SOURCE,
    "full",
    false,
    true,
  );
  expect(poster.url).toMatch(/^data:image\/jpeg;base64,/);
  expect(poster.camera?.yaw).toBe(45);
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  await expect(
    loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE),
  ).rejects.toThrow();
});
