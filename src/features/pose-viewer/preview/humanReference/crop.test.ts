import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { humanScopes, parseHumanTemplate } from "./template";
import manifest from "./approvedAssets/manifest.json";
import { referenceSurface } from "./surface";
import type { PreviewGender } from "./approvedModels";

afterEach(() => vi.unstubAllGlobals());

it.each<PreviewGender>(["male", "female"])(
  "closes every %s crop with outward faces and retains finger/corrective vertex identities",
  async (gender) => {
    vi.stubGlobal(
      "fetch",
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
    const { loadApprovedModel } = await import("./approvedModels");
    const signal = new AbortController().signal;
    const full = await loadApprovedModel(gender, "full", signal);
    const original = JSON.stringify(full.template);
    const bvh = readFileSync(resolve("src/test/fixtures/approved-preview/raised.bvh"), "utf8");
    for (const scope of humanScopes.filter((s) => s !== "full")) {
      const cropped = await loadApprovedModel(gender, scope, signal);
      expect(parseHumanTemplate(cropped.template, scope, manifest[gender])).toBe(cropped.template);
      for (const [index, mesh] of cropped.template.meshes.entries()) {
        const base = full.template.meshes[index];
        expect(mesh.positions.slice(0, base.positions.length)).toEqual(base.positions);
        expect(mesh.skinIndices.slice(0, base.skinIndices.length)).toEqual(base.skinIndices);
        expect(mesh.skinWeights.slice(0, base.skinWeights.length)).toEqual(base.skinWeights);
        expect(cropped.skin.weights[index].slice(0, full.skin.weights[index].length)).toEqual(
          full.skin.weights[index],
        );
        const edges = new Map<string, { count: number; winding: number }>();
        for (let i = 0; i < mesh.triangles.length; i += 3) {
          const face = mesh.triangles.slice(i, i + 3);
          for (let k = 0; k < 3; k++) {
            const a = face[k],
              b = face[(k + 1) % 3];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            const edge = edges.get(key) ?? { count: 0, winding: 0 };
            edge.count++;
            edge.winding += a < b ? 1 : -1;
            edges.set(key, edge);
          }
        }
        const defects = [...edges.entries()].filter(([, e]) => e.count !== 2 || e.winding !== 0);
        expect(defects, `${gender}/${scope} open or inconsistently wound edges`).toEqual([]);
      }
      const surface = referenceSurface(cropped.template, bvh, cropped.skin, cropped.corrections);
      expect(surface.bounds.isEmpty()).toBe(false);
      surface.release();
      expect((await loadApprovedModel(gender, scope, signal)).template).toBe(cropped.template);
    }
    expect(JSON.stringify(full.template)).toBe(original);
  },
);
