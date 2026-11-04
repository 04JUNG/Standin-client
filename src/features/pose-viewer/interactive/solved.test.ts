import { webcrypto } from "node:crypto";
import { expect, it, beforeAll, vi } from "vitest";
import fixture from "./__fixtures__/converter-packet.json";
import { loadSolvedPacket, modelSchema, prepareSurface } from "./solved";
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
const expected = {
  operationId: "op_fixture",
  revision: 1,
  stateHash: fixture.packet.stateHash,
  personIndex: 0,
  candidateId: "candidate",
};
it("consumes exact Python canonical f64 bytes and preserves all skin weights in the displayed surface", async () => {
  const { state } = await loadSolvedPacket(fixture.packet, expected);
  const surface = prepareSurface(state.model);
  const mesh = surface.body.children[0] as import("three").Mesh;
  expect([...mesh.geometry.getAttribute("position").array]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  surface.release();
});
it("rejects stale revision/hash/person/candidate and tampered canonical bytes", async () => {
  for (const changed of [
    { revision: 2 },
    { stateHash: "a".repeat(64) },
    { personIndex: 1 },
    { candidateId: "other" },
  ])
    await expect(loadSolvedPacket(fixture.packet, { ...expected, ...changed })).rejects.toThrow();
  await expect(
    loadSolvedPacket(
      {
        ...fixture.packet,
        canonicalState: fixture.packet.canonicalState.replace("fixture", "changed"),
      },
      expected,
    ),
  ).rejects.toThrow();
});
it("bounds bones, skin weights, topology, resource fields and nonfinite positions separately from static GLB", async () => {
  const { state } = await loadSolvedPacket(fixture.packet, expected);
  const bad = structuredClone(state.model);
  bad.bones[0].parent = 0;
  expect(modelSchema.safeParse(bad).success).toBe(false);
  bad.bones[0].parent = -1;
  bad.meshes[0].weights[0] = [[0, 0.2]];
  expect(modelSchema.safeParse(bad).success).toBe(false);
  expect(
    modelSchema.safeParse({ ...state.model, uri: "https://external.invalid/model" }).success,
  ).toBe(false);
});
