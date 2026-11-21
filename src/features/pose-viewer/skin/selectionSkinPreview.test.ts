import { expect, it, vi } from "vitest";
import { apiFetchResponse } from "@/shared/api/client";
import { selectionSkinPreview } from "./selectionSkinPreview";
import { skinPreviewSchema } from "./skinPreview";
import { previewFixture } from "./__fixtures__/skinPreview";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
it("accepts only the selected candidate's current base-bound display assets", async () => {
  const location = "/v1/analysis/jobs/job_fixture/people/0",
    candidateId = "candidate";
  const skinPreview = skinPreviewSchema.parse(previewFixture()),
    baseSelectionHash = "a".repeat(64);
  const query = new URLSearchParams({
    candidateId,
    skin: JSON.stringify(skinPreview.skin),
    baseSelectionHash,
  });
  for (const asset of [skinPreview.uv, skinPreview.texture])
    asset.url = `${location}/selection-skin-assets/${asset.sha256}?${query}`;
  vi.mocked(apiFetchResponse).mockImplementation(
    async () => new Response(JSON.stringify({ baseSelectionHash, skinPreview })),
  );
  expect(
    (
      await selectionSkinPreview(
        location,
        candidateId,
        skinPreview.skin,
        new AbortController().signal,
      )
    ).baseSelectionHash,
  ).toBe(baseSelectionHash);
  skinPreview.texture.url = skinPreview.texture.url.replace(
    "candidateId=candidate",
    "candidateId=another",
  );
  await expect(
    selectionSkinPreview(location, candidateId, skinPreview.skin, new AbortController().signal),
  ).rejects.toThrow("escaped selection");
});
