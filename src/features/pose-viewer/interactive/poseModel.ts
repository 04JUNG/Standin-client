import type { PoseModel } from "./solved";
import { triangleIndexJson, type BinaryModel } from "./shared/interactive_pose_v2.mjs";
/** Typed-array model from the binary v2 state; produced only by `loadBinarySolvedState`. */
export type BinaryPoseModel = BinaryModel;
/** v1 nested-array model (typed-f64be-json-v1) or v2 typed-array model (standin-binary-f64le-v2). */
export type AnyPoseModel = PoseModel | BinaryPoseModel;
export function isBinaryModel(model: AnyPoseModel): model is BinaryPoseModel {
  return !!model.meshes?.[0] && ArrayBuffer.isView(model.meshes[0].triangles);
}
/** Read-only topology view for skin pins and UV correspondence; identical answers for v1/v2. */
export function meshTopology(model: AnyPoseModel, index: number) {
  if (isBinaryModel(model)) {
    const mesh = model.meshes[index];
    return {
      name: mesh.name,
      vertexCount: mesh.vertexCount,
      triangleCount: mesh.triangleCount,
      /** Exactly `JSON.stringify` of the `[[a,b,c],...]` list, as pinned by `trianglesSha256`. */
      triangleJson: () => triangleIndexJson(mesh.triangles),
      corner: (triangle: number, corner: number): number | undefined =>
        triangle >= 0 && triangle < mesh.triangleCount && corner >= 0 && corner < 3
          ? mesh.triangles[triangle * 3 + corner]
          : undefined,
    };
  }
  const mesh = model.meshes[index];
  return {
    name: mesh.name,
    vertexCount: mesh.positions.length,
    triangleCount: mesh.triangles.length,
    triangleJson: () => JSON.stringify(mesh.triangles),
    corner: (triangle: number, corner: number): number | undefined =>
      mesh.triangles[triangle]?.[corner],
  };
}
