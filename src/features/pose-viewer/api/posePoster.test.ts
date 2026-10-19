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
