// @vitest-environment node
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { apiFetchResponse } from "@/shared/api/client";
import fixture from "../interactive/__fixtures__/converter-packet.json";
import { loadSolvedPacket, prepareSurface } from "../interactive/solved";
import { loadSkinSurface, type SkinPreview } from "./skinPreview";

vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

it("recovers a transient UV 503 while fetching the image only once", async () => {
  const { state } = await loadSolvedPacket(fixture.packet, {
    operationId: "op_fixture",
    revision: 1,
    stateHash: fixture.packet.stateHash,
    personIndex: 0,
    candidateId: "candidate",
  });
  const source = prepareSurface(state.model);
  const mesh = state.model.meshes[0];
  const char = state.identity.body;
  const uv = new Uint8Array(gzipSync(JSON.stringify({
    source_sha256: char.characterSha256,
    triangles: mesh.triangles,
    uv: [[0, 0], [1, 0], [0, 1]],
  })));
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(png.buffer);
  view.setUint32(16, 2048);
  view.setUint32(20, 2048);
  const preview: SkinPreview = {
    schema: "skin-preview-v1",
    skin: { version: "fbx-skin-v1", id: "flesh" },
    assetVersion: "fixture",
    assetManifestSha256: "a".repeat(64),
    compatibility: {
      characterId: char.characterId,
      characterSha256: char.characterSha256,
      previewMesh: mesh.name,
      vertices: mesh.positions.length,
      bones: state.model.bones.length,
      polygonIndicesSha256: "a".repeat(64),
      weightsSha256: "a".repeat(64),
      trianglesSha256: sha(JSON.stringify(mesh.triangles)),
    },
    uv: { url: "/uv", sha256: sha(uv), bytes: uv.length },
    texture: { url: "/texture", sha256: sha(png), bytes: png.length },
  };
  const expected = { stateHash: fixture.packet.stateHash, revision: 1 };
  const order: string[] = [];
  vi.mocked(apiFetchResponse).mockImplementation(async (path) => {
    order.push(path);
    if (order.length === 1) throw new ApiError(503, "SKIN_UNAVAILABLE", "");
    const isUv = path === "/uv";
    return new Response(isUv ? uv : png, { headers: {
      "Content-Type": isUv ? "application/gzip" : "image/png",
      "X-Skin-Asset-SHA256": isUv ? preview.uv.sha256 : preview.texture.sha256,
      "X-Standin-State-Hash": expected.stateHash,
      "X-Standin-Revision": String(expected.revision),
    } });
  });
  const bitmap = { width: 2048, height: 2048, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  try {
    const result = await loadSkinSurface(preview, expected, source.body, state.model, new AbortController().signal);
    expect(order).toEqual(["/uv", "/texture", "/uv"]);
    expect(result.body).not.toBe(source.body);
    result.release();
    expect(bitmap.close).toHaveBeenCalledOnce();
  } finally {
    source.release();
  }
});
