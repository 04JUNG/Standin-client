// @vitest-environment node
import { webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as THREE from "three";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { apiFetchResponse } from "@/shared/api/client";
import v1Fixture from "../interactive/__fixtures__/converter-packet.json";
import v2Fixture from "../interactive/__fixtures__/converter-packet-v2.json";
import { sha256, stateBytes } from "../interactive/__fixtures__/binaryState";
import { loadBinarySolvedState, loadSolvedPacket } from "../interactive/solved";
import type { AnyPoseModel } from "../interactive/poseModel";
import { loadSkinSurface, type SkinPreview } from "./skinPreview";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
beforeEach(() => {
  vi.mocked(apiFetchResponse).mockReset();
});

const root = "/v1/analysis/jobs/job_fixture/people/0/interactive-state/op_fixture";
const binding = { stateHash: "b".repeat(64), revision: 1 };
const characterSha256 = "a".repeat(64);
// Valid PNG signature and IHDR, but not the pinned 2048x2048: the loader stops right after
// the triangle pin and UV correspondence, before any GPU texture work.
const png = new Uint8Array(33);
png.set([137, 80, 78, 71, 13, 10, 26, 10]);
png.set(new TextEncoder().encode("IHDR"), 12);
new DataView(png.buffer).setUint32(16, 16);
new DataView(png.buffer).setUint32(20, 16);

async function models() {
  const legacy = await loadSolvedPacket(v1Fixture.packet, {
    operationId: "op_fixture",
    revision: 1,
    stateHash: v1Fixture.packet.stateHash,
    personIndex: 0,
    candidateId: "candidate",
  });
  const binary = await loadBinarySolvedState(stateBytes(v2Fixture), {
    operationId: "op_fixture",
    revision: 1,
    stateHash: v2Fixture.packet.stateHash,
    personIndex: 0,
    candidateId: "candidate",
  });
  return {
    v1: legacy.state.model,
    v2: binary.state.model,
    triangles: legacy.state.model.meshes[0].triangles,
  };
}
async function preview(triangles: number[][], model: AnyPoseModel, trianglesSha256?: string) {
  const uv = gzipSync(
    JSON.stringify({
      source_sha256: characterSha256,
      triangles,
      uv: triangles.flatMap(() => [
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
    }),
  );
  const assets = new Map([
    [`${root}/skin-assets/${await sha256(uv)}`, { body: uv, type: "application/gzip" }],
    [`${root}/skin-assets/${await sha256(png)}`, { body: png, type: "image/png" }],
  ]);
  vi.mocked(apiFetchResponse).mockImplementation(async (url) => {
    const asset = assets.get(url);
    if (!asset) throw Error("unexpected asset");
    return new Response(asset.body, {
      headers: {
        "Content-Type": asset.type,
        "X-Skin-Asset-SHA256": url.split("/").pop()!,
        "X-Standin-State-Hash": binding.stateHash,
        "X-Standin-Revision": String(binding.revision),
      },
    });
  });
  return {
    schema: "skin-preview-v1",
    skin: { version: "fbx-skin-v1", id: "flesh" },
    assetVersion: "fixture",
    assetManifestSha256: "c".repeat(64),
    compatibility: {
      characterId: "fixture",
      characterSha256,
      previewMesh: model.meshes[0].name,
      vertices: 3,
      bones: model.bones.length,
      polygonIndicesSha256: "d".repeat(64),
      weightsSha256: "e".repeat(64),
      trianglesSha256:
        trianglesSha256 ?? (await sha256(new TextEncoder().encode(JSON.stringify(triangles)))),
    },
    uv: {
      sha256: await sha256(uv),
      bytes: uv.length,
      url: `${root}/skin-assets/${await sha256(uv)}`,
    },
    texture: {
      sha256: await sha256(png),
      bytes: png.length,
      url: `${root}/skin-assets/${await sha256(png)}`,
    },
  } as SkinPreview;
}
const load = (p: SkinPreview, model: AnyPoseModel) =>
  loadSkinSurface(p, binding, new THREE.Group(), model, new AbortController().signal);

it("checks the same trianglesSha256 pin and UV correspondence for v1 and v2 models", async () => {
  const { v1, v2, triangles } = await models();
  for (const model of [v1, v2]) {
    // Pin, mesh identity and UV triangles all match: only the (fake) image is refused.
    await expect(load(await preview(triangles, model), model)).rejects.toThrow(
      "skin image dimensions changed",
    );
    const pinned = vi.mocked(apiFetchResponse).mock.calls.length;
    expect(pinned).toBe(2);
    vi.mocked(apiFetchResponse).mockClear();
    await expect(load(await preview(triangles, model, "f".repeat(64)), model)).rejects.toThrow(
      "asset digest mismatch",
    );
    expect(apiFetchResponse).not.toHaveBeenCalled();
    const reordered = [[triangles[0][2], triangles[0][1], triangles[0][0]]];
    const swapped = await preview(reordered, model);
    await expect(
      load(
        {
          ...swapped,
          compatibility: {
            ...swapped.compatibility,
            trianglesSha256: await sha256(new TextEncoder().encode(JSON.stringify(triangles))),
          },
        },
        model,
      ),
    ).rejects.toThrow("skin UV correspondence changed");
    const wrongCount = await preview(triangles, model);
    await expect(
      load({ ...wrongCount, compatibility: { ...wrongCount.compatibility, vertices: 4 } }, model),
    ).rejects.toThrow("skin model changed");
    vi.mocked(apiFetchResponse).mockClear();
  }
});
