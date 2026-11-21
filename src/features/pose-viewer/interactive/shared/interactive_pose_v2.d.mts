export const ENCODING: "standin-binary-f64le-v2";
export const MEDIA_TYPE: "application/vnd.standin.solved-pose-state-v2";
/** Row-major 4x4 views into the verified private copy; treat as read-only. */
export type BinaryBone = Readonly<{
  name: string;
  parent: number;
  restLocal: Float64Array;
  poseLocal: Float64Array;
  inverseBind: Float64Array;
}>;
export type BinaryMesh = Readonly<{
  name: string;
  vertexCount: number;
  normalCount: number;
  triangleCount: number;
  positions: Float64Array;
  normals: Float64Array;
  triangles: Uint32Array;
  normalTriangles: Uint32Array;
  weightOffsets: Uint32Array;
  weightBones: Uint16Array;
  weightValues: Float64Array;
}>;
export type BinaryModel = Readonly<{
  schema: "interactive-pose-model-v1";
  coordinates: Readonly<{
    space: "right-handed-y-up-metres-hip-origin";
    originBlender: readonly [number, number, number];
    matrixLayout: "row-major";
    baked: "rigged_rest";
  }>;
  capabilities: Readonly<{ localHands: false }>;
  bones: readonly BinaryBone[];
  meshes: readonly BinaryMesh[];
}>;
export type BinarySolvedStateV2 = Readonly<{
  schema: "solved-pose-state-v1";
  /** Decoded header JSON; shape is not validated by the reader beyond being canonical. */
  identity: unknown;
  safety: unknown;
  dependencies: unknown;
  model: BinaryModel;
  stateHash: string;
  modelSha256: string;
  byteLength: number;
}>;
export function readSolvedStateV2(
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<BinarySolvedStateV2>;
export function triangleIndexJson(triangles: Uint32Array): string;
export function toV1Model(model: BinaryModel): {
  schema: "interactive-pose-model-v1";
  coordinates: {
    space: "right-handed-y-up-metres-hip-origin";
    originBlender: [number, number, number];
    matrixLayout: "row-major";
    baked: "rigged_rest";
  };
  capabilities: { localHands: false };
  bones: {
    name: string;
    parent: number;
    restLocal: number[];
    poseLocal: number[];
    inverseBind: number[];
  }[];
  meshes: {
    name: string;
    positions: [number, number, number][];
    normals: [number, number, number][];
    normalTriangles: [number, number, number][];
    triangles: [number, number, number][];
    weights: [number, number][][];
  }[];
};
