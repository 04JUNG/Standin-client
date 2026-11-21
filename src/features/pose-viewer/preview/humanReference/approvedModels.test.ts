import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "./approvedAssets/manifest.json";
afterEach(() => vi.unstubAllGlobals());
it("loads each bundled approved gender once and shares it across poses and scopes", async () => {
  vi.resetModules();
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        readFileSync(
          resolve(
            "src/features/pose-viewer/preview/humanReference/approvedAssets",
            `${url.includes("female") ? "female" : "male"}.json.gz`,
          ),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const { loadApprovedModel } = await import("./approvedModels");
  const signal = new AbortController().signal;
  const female = await loadApprovedModel("female", "full", signal);
  const again = await loadApprovedModel("female", "full", signal);
  const head = await loadApprovedModel("female", "head", signal);
  const male = await loadApprovedModel("male", "full", signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(female.template).toBe(again.template);
  expect(female.template.character_sha256).toBe(manifest.female.characterSha256);
  expect(male.template.character_sha256).toBe(manifest.male.characterSha256);
  expect(head.template.meshes[0].triangles.length).toBeLessThan(
    female.template.meshes[0].triangles.length,
  );
  expect(
    head.template.meshes[0].positions.slice(0, female.template.meshes[0].positions.length),
  ).toEqual(female.template.meshes[0].positions);
  for (const model of [female, male]) {
    expect(model.skin.joints).toHaveLength(30);
    const count = model.template.joints.length + model.skin.joints.length;
    for (const [vertex, weights] of model.skin.weights[0]) {
      expect(vertex).toBeLessThan(model.template.meshes[0].positions.length / 3);
      expect(weights.every(([joint, weight]) => joint < count && weight >= 0 && weight <= 1)).toBe(
        true,
      );
    }
  }
});
it("rejects altered bundled bytes instead of showing the old model", async () => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
  );
  const { loadApprovedModel } = await import("./approvedModels");
  await expect(loadApprovedModel("female", "full", new AbortController().signal)).rejects.toThrow(
    "변경",
  );
});
