// @vitest-environment node
/** Opt-in artifact-backed gate. Licensed/private bytes are never checked in. */
import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as THREE from "three";
import {
  loadSolvedPacket,
  prepareSurface,
  prepareHandVariants,
  localHandSurface,
} from "../src/features/pose-viewer/interactive/solved";
import { InteractiveController } from "../src/features/pose-viewer/interactive/controller";
const directory = process.env.STANDIN_REAL_PACKET_DIR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
test.skipIf(!directory)(
  "real HTTP packets, compiled full-influence surfaces, hand atlas and final FBXs agree",
  async () => {
    const states = [];
    for (let i = 0; i < 3; i++) {
      const packet = JSON.parse(
        await readFile(path.join(directory, `case-${i}.packet.private.json`), "utf8"),
      );
      const receipt = JSON.parse(
        await readFile(path.join(directory, `case-${i}.receipt.private.json`), "utf8"),
      );
      const selection = JSON.parse(packet.canonicalState).identity.selection;
      const loaded = await loadSolvedPacket(packet, {
        operationId: packet.operation,
        revision: packet.revision,
        stateHash: packet.stateHash,
        personIndex: 0,
        candidateId: selection.candidate,
      });
      expect(receipt.stateHash).toBe(packet.stateHash);
      expect(receipt.verified).toBe(true);
      for (const field of [
        "maxPositionErrorM",
        "maxMatrixError",
        "maxWeightError",
        "maxNormalError",
      ])
        expect(receipt.correspondence[field]).toBe(0);
      const fbx = await readFile(path.join(directory, `case-${i}.fbx`));
      expect(sha(fbx)).toBe(receipt.artifactSha256);
      const surface = prepareSurface(loaded.state.model);
      let maxPosition = 0,
        maxNormal = 0;
      loaded.state.model.meshes.forEach((mesh, m) => {
        const geometry = surface.body.children[m].geometry,
          p = geometry.getAttribute("position"),
          n = geometry.getAttribute("normal");
        expect(surface.body.children[m].material.side).toBe(THREE.DoubleSide);
        mesh.triangles.forEach((tri, t) =>
          tri.forEach((v, c) => {
            const k = t * 3 + c;
            maxPosition = Math.max(
              maxPosition,
              new THREE.Vector3()
                .fromBufferAttribute(p, k)
                .distanceTo(new THREE.Vector3(...mesh.positions[v])),
            );
            maxNormal = Math.max(
              maxNormal,
              new THREE.Vector3()
                .fromBufferAttribute(n, k)
                .distanceTo(new THREE.Vector3(...mesh.normals[mesh.normalTriangles[t][c]])),
            );
          }),
        );
      });
      expect(maxPosition).toBeLessThan(0.0001);
      expect(maxNormal).toBeLessThan(0.0001);
      surface.release();
      states.push(loaded);
    }
    expect(states[1].state.identity.hands.left).toBe("fist");
    expect(states[2].state.identity.source.refinedBvhSha256).not.toBeNull();
    expect(states[2].state.identity.source.refinedBvhSha256).not.toBe(
      states[0].state.identity.source.originalBvhSha256,
    );
    const bytes = await readFile(path.join(directory, "hands-atlas.private.json"));
    const atlas = await prepareHandVariants(new Uint8Array(bytes), sha(bytes));
    expect(localHandSurface(atlas, states[0].state.identity, "fist", "relaxed")).toBeTruthy();
    expect(() => localHandSurface(atlas, states[2].state.identity, "fist", "relaxed")).toThrow();
    const op = {
      operationId: states[0].packet.operation,
      candidateId: states[0].state.identity.selection.candidate,
      revision: states[0].packet.revision,
      stateHash: states[0].packet.stateHash,
      selectionHash: "a".repeat(64),
      previewState: "authoritative",
      exportState: "ready",
      eventSequence: 1,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };
    const transport = {
      head: async () => ({
        currentRevision: op.revision,
        currentStateHash: op.stateHash,
        operation: op,
      }),
      prepare: async () => op,
      poll: async () => op,
      cancel: async () => {},
      export: async () => op,
      model: async () => ({
        ...states[0],
        frame: { target: [0, 0, 0], referenceAspect: 1, projectionIncludesCenterScaleCrop: true },
      }),
    };
    const controller = new InteractiveController(
      { jobId: "job_real", personIndex: 0 },
      transport,
      0,
      1,
    );
    controller.select("real-binding", op.candidateId, true);
    await expect.poll(() => controller.snapshot().model, { timeout: 5000 }).toBeTruthy();
    controller.installHandAtlas(atlas);
    controller.invalidate(true);
    expect(controller.applyHands("fist", "relaxed")).toBe(true);
    expect(controller.snapshot().previewState).toBe("local-draft");
    expect(controller.snapshot().exportState).toBe("superseded");
    expect(controller.ready("real-binding")).toBe(false);
    controller.invalidate();
    expect(controller.applyHands("fist", "relaxed")).toBe(false);
    controller.dispose();
  },
  60000,
);
