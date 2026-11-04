import { z } from "zod";
import * as THREE from "three";
import { digest, type SearchCamera } from "./contract";
import {
  readSolvedState,
  readHandVariants,
  selectHandVariant,
} from "./shared/interactive_pose_v1.mjs";
import { libraryPreviewMaterial } from "../preview/previewStyle";
const n = z.number().finite();
const matrix = z.array(n).length(16);
const point = z.tuple([n, n, n]);
const id = z.string().min(1).max(200);
export const converterCamera = z
  .object({
    projection: z.enum(["perspective", "orthographic"]),
    viewMatrix: matrix,
    projectionMatrix: matrix,
    distanceTorso: n.positive(),
    torsoReferenceSha256: digest,
    baked: z.literal(false),
  })
  .strict();
export const identitySchema = z
  .object({
    ownerBinding: digest,
    selection: z
      .object({ operation: id, revision: z.number().int().positive(), person: id, candidate: id })
      .strict(),
    source: z
      .object({ originalBvhSha256: digest, refinedBvhSha256: digest.nullable(), refineVersion: id })
      .strict(),
    body: z.object({ characterId: id, characterSha256: digest, rigProfile: id }).strict(),
    shape: z
      .object({
        sha256: digest.nullable(),
        rulesVersion: id,
        sourceSha256: digest.nullable(),
        controlsSha256: digest.nullable(),
      })
      .strict(),
    hands: z
      .object({
        left: id.nullable(),
        right: id.nullable(),
        librarySha256: digest,
        rulesVersion: id,
      })
      .strict(),
    scope: z.enum(["full", "half", "bust", "head", "shoulder_head"]),
    mirror: z.boolean(),
    camera: converterCamera,
    solver: z
      .object({ version: id, manifestSha256: digest, adapterVersion: id, runtimeSha256: digest })
      .strict(),
  })
  .strict();
const boneSchema = z
  .object({
    name: id,
    parent: z.number().int().min(-1).max(255),
    restLocal: matrix,
    poseLocal: matrix,
    inverseBind: matrix,
  })
  .strict();
const meshSchema = z
  .object({
    name: id,
    positions: z.array(point).min(1).max(500000),
    normals: z.array(point).min(1).max(3000000),
    normalTriangles: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      )
      .min(1)
      .max(1000000),
    triangles: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      )
      .min(1)
      .max(1000000),
    weights: z
      .array(
        z
          .array(z.tuple([z.number().int().nonnegative().max(255), n.positive().max(1)]))
          .min(1)
          .max(32),
      )
      .min(1)
      .max(500000),
  })
  .strict();
export const modelSchema = z
  .object({
    schema: z.literal("interactive-pose-model-v1"),
    coordinates: z
      .object({
        space: z.literal("right-handed-y-up-metres-hip-origin"),
        originBlender: point,
        matrixLayout: z.literal("row-major"),
        baked: z.literal("rigged_rest"),
      })
      .strict(),
    bones: z.array(boneSchema).min(1).max(256),
    meshes: z.array(meshSchema).min(1).max(32),
    capabilities: z.object({ localHands: z.literal(false) }).strict(),
  })
  .strict()
  .superRefine((model, ctx) => {
    const invalid = () => ctx.addIssue({ code: "custom", message: "invalid bounded rig/surface" });
    const names = new Set<string>();
    let vertices = 0;
    for (const [i, b] of model.bones.entries()) {
      if (b.parent >= i || names.has(b.name)) invalid();
      names.add(b.name);
      for (const m of [b.restLocal, b.poseLocal, b.inverseBind])
        if (Math.abs(fromRow(m).determinant()) < 1e-12) invalid();
    }
    names.clear();
    for (const mesh of model.meshes) {
      vertices += mesh.positions.length;
      if (
        vertices > 500000 ||
        names.has(mesh.name) ||
        mesh.normalTriangles.length !== mesh.triangles.length ||
        mesh.weights.length !== mesh.positions.length
      )
        invalid();
      names.add(mesh.name);
      for (const tri of mesh.triangles) if (tri.some((i) => i >= mesh.positions.length)) invalid();
      for (const tri of mesh.normalTriangles)
        if (tri.some((i) => i >= mesh.normals.length)) invalid();
      for (const weights of mesh.weights)
        if (
          weights.some(([b]) => b >= model.bones.length) ||
          new Set(weights.map(([b]) => b)).size !== weights.length ||
          Math.abs(weights.reduce((sum, [, w]) => sum + w, 0) - 1) > 1e-4
        )
          invalid();
    }
  });
const stateSchema = z
  .object({
    schema: z.literal("solved-pose-state-v1"),
    identity: identitySchema,
    model: modelSchema,
    safety: z
      .object({
        bodyAccepted: z.literal(true),
        handChecksPassed: z.literal(true),
        surface: z.literal("existing-adapter-checks-only"),
        finalFileVerified: z.literal(false),
      })
      .strict(),
    dependencies: z
      .object({
        initialFbxRequired: z.literal(true),
        boundary: z.literal("post-frozen-body-pre-final-export-v1"),
      })
      .strict(),
  })
  .strict();
export type SolvedState = z.infer<typeof stateSchema>;
export type PoseModel = z.infer<typeof modelSchema>;
export const packetSchema = z
  .object({
    schema: z.literal("solved-pose-state-v1"),
    operation: id,
    revision: z.number().int().positive(),
    stateHash: digest,
    previewState: z.literal("authoritative"),
    exportState: z.literal("not-requested"),
    canonicalEncoding: z.literal("typed-f64be-json-v1"),
    canonicalState: z
      .string()
      .min(1)
      .max(64 * 1024 * 1024),
  })
  .strict();
export type SolvedPacket = z.infer<typeof packetSchema>;
export async function loadSolvedPacket(
  raw: unknown,
  expected: {
    operationId: string;
    revision: number;
    stateHash: string;
    personIndex: number;
    candidateId: string;
  },
) {
  const packet = packetSchema.parse(raw);
  if (
    packet.operation !== expected.operationId ||
    packet.revision !== expected.revision ||
    packet.stateHash !== expected.stateHash
  )
    throw Error("stale solved packet");
  const state = stateSchema.parse(
    await readSolvedState(
      new Uint8Array(new TextEncoder().encode(packet.canonicalState)),
      expected.stateHash,
    ),
  );
  const selection = state.identity.selection;
  if (
    selection.operation !== packet.operation ||
    selection.revision !== packet.revision ||
    selection.person !== String(expected.personIndex) ||
    selection.candidate !== expected.candidateId
  )
    throw Error("solved selection mismatch");
  return { packet, state };
}
export function fromRow(value: number[]) {
  return new THREE.Matrix4().fromArray(value).transpose();
}
/** Do not derive missing projection/framing from model bounds or rounded yaw. */
export const frameSchema = z
  .object({
    target: point,
    referenceAspect: n.positive().max(10),
    projectionIncludesCenterScaleCrop: z.literal(true),
  })
  .strict();
export type CameraFrame = z.infer<typeof frameSchema>;
export function solvedCamera(state: SolvedState, frame: CameraFrame): SearchCamera {
  const c = state.identity.camera;
  return {
    schemaVersion: "interactive-camera-v1",
    projection: c.projection,
    viewMatrix: fromRow(c.viewMatrix).toArray(),
    projectionMatrix: fromRow(c.projectionMatrix).toArray(),
    matrixLayout: "column-major",
    basis: "right-handed-Y-up",
    clipSpace: "webgl-minus-one-to-one",
    origin: "hips",
    units: "meters",
    distanceTorso: c.distanceTorso,
    torsoReferenceSha256: c.torsoReferenceSha256,
    target: frame.target,
    referenceAspect: frame.referenceAspect,
    framing: "projection-includes-center-scale-crop",
    baked: c.baked ? "view" : "none",
  };
}
/** Exact full-influence linear blend, once per loaded packet. No independent hand solver or discarded skin weights. */
export function prepareSurface(input: PoseModel) {
  const model = modelSchema.parse(input);
  const world: THREE.Matrix4[] = [];
  const transforms = model.bones.map((bone, i) => {
    const pose = fromRow(bone.poseLocal);
    world[i] = bone.parent < 0 ? pose : world[bone.parent].clone().multiply(pose);
    return world[i].clone().multiply(fromRow(bone.inverseBind));
  });
  const normalTransforms = transforms.map((t) => new THREE.Matrix3().getNormalMatrix(t));
  if (model.meshes.reduce((sum, m) => sum + m.triangles.length * 72, 0) > 48 * 1024 * 1024)
    throw Error("surface GPU budget");
  const body = new THREE.Group();
  try {
    for (const mesh of model.meshes) {
      const corners = mesh.triangles.length * 3;
      const memory = corners * 3 * 4 * 2;
      if (memory > 48 * 1024 * 1024) throw Error("surface GPU budget");
      const positions = new Float32Array(corners * 3),
        normals = new Float32Array(corners * 3);
      const skinned = new Float32Array(mesh.positions.length * 3);
      const source = new THREE.Vector3(),
        result = new THREE.Vector3(),
        scratch = new THREE.Vector3();
      for (let i = 0; i < mesh.positions.length; i++) {
        source.fromArray(mesh.positions[i]);
        result.set(0, 0, 0);
        for (const [bone, weight] of mesh.weights[i])
          result.addScaledVector(scratch.copy(source).applyMatrix4(transforms[bone]), weight);
        if (![result.x, result.y, result.z].every(Number.isFinite))
          throw Error("invalid skinned position");
        result.toArray(skinned, i * 3);
      }
      for (let t = 0; t < mesh.triangles.length; t++)
        for (let c = 0; c < 3; c++) {
          const vertex = mesh.triangles[t][c],
            normalIndex = mesh.normalTriangles[t][c],
            output = (t * 3 + c) * 3;
          positions.set(skinned.subarray(vertex * 3, vertex * 3 + 3), output);
          source.fromArray(mesh.normals[normalIndex]);
          result.set(0, 0, 0);
          for (const [bone, weight] of mesh.weights[vertex])
            result.addScaledVector(
              scratch.copy(source).applyMatrix3(normalTransforms[bone]),
              weight,
            );
          result.normalize().toArray(normals, output);
        }
      if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite))
        throw Error("surface float32 bounds");
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      const material = libraryPreviewMaterial();
      material.side = THREE.DoubleSide;
      body.add(new THREE.Mesh(geometry, material));
    }
    return {
      body,
      release() {
        body.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
          }
        });
      },
    };
  } catch (error) {
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (!Array.isArray(o.material)) o.material.dispose();
      }
    });
    throw error;
  }
}
export type LoadedVariants = {
  bytes: number;
  gpuBytes: number;
  table: unknown;
  surfaces: Map<string, ReturnType<typeof prepareSurface>>;
  release(): void;
};
export async function prepareHandVariants(bytes: Uint8Array, sha: string): Promise<LoadedVariants> {
  const table = await readHandVariants(bytes, sha);
  const schema = z
    .object({
      prepared: z.record(z.object({ state: stateSchema, stateHash: digest, modelSha256: digest })),
    })
    .passthrough();
  const parsed = schema.parse(table);
  const entries = Object.values(parsed.prepared);
  if (
    !entries.length ||
    entries.length > 32 ||
    entries.reduce(
      (sum, entry) =>
        sum + entry.state.model.meshes.reduce((n, m) => n + m.triangles.length * 72, 0),
      0,
    ) >
      64 * 1024 * 1024
  )
    throw Error("hand atlas GPU budget");
  const surfaces = new Map<string, ReturnType<typeof prepareSurface>>();
  const release = () => {
    for (const surface of surfaces.values()) surface.release();
    surfaces.clear();
  };
  try {
    for (const [key, entry] of Object.entries(parsed.prepared))
      surfaces.set(key, prepareSurface(entry.state.model));
  } catch (error) {
    release();
    throw error;
  }
  return {
    table,
    surfaces,
    release,
    bytes: bytes.byteLength,
    gpuBytes: entries.reduce(
      (sum, entry) =>
        sum + entry.state.model.meshes.reduce((n, m) => n + m.triangles.length * 72, 0),
      0,
    ),
  };
}
/** Synchronous: all exact server variants have already been parsed/uploaded. Debounce applies only to HTTP preparation. */
export function localHandSurface(
  atlas: LoadedVariants,
  identity: SolvedState["identity"],
  left: string | null,
  right: string | null,
) {
  const selected = selectHandVariant(atlas.table, identity, { left, right });
  return selected ? atlas.surfaces.get(JSON.stringify([left, right])) : undefined;
}
