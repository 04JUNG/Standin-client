import * as THREE from "three";
import { expect, it } from "vitest";
import { sourceFingerPose, type FingerSkin } from "./sourceFingers";
import type { HumanTemplate } from "./template";

const digits = ["thumb", "index", "middle", "ring", "pinky"];
const joint = (role: string, parent: number, head: number[], tail: number[]) => ({
  role,
  parent,
  head,
  tail,
});
const template = {
  joints: [joint("hand.L", -1, [0, 0, 0], [0, 1, 0])],
  meshes: [
    {
      positions: [1, 3, 0],
      normals: [0, 0, 1],
      skinIndices: Array(8).fill(0),
      skinWeights: [1, 0, 0, 0, 0, 0, 0, 0],
      triangles: [],
    },
  ],
} as unknown as HumanTemplate;
const skin: FingerSkin = {
  baseSha: "",
  joints: digits.flatMap((digit, i) =>
    [1, 2, 3].map((j) =>
      joint(digit + j + ".L", j === 1 ? 0 : i * 3 + j - 1, [2 - i, j, 0], [2 - i, j + 1, 0]),
    ),
  ),
  weights: [[[0, [[6, 1]]]]],
};
const base = {
  positions: [new THREE.Vector3()],
  rotations: [new THREE.Quaternion()],
  matrices: [new THREE.Matrix4()],
  roles: ["hand.L"],
};
const frame = (indexThirdOffset: string) => `HIERARCHY
ROOT LeftHand
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  ${digits
    .map(
      (digit, i) => `
  JOINT LeftHand${digit[0].toUpperCase() + digit.slice(1)}1
  {
    OFFSET ${2 - i} 1 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT LeftHand${digit[0].toUpperCase() + digit.slice(1)}2
    {
      OFFSET 0 1 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT LeftHand${digit[0].toUpperCase() + digit.slice(1)}3
      {
        OFFSET ${digit === "index" ? indexThirdOffset : "0 1 0"}
        CHANNELS 3 Zrotation Xrotation Yrotation
        End Site
        {
          OFFSET 0 1 0
        }
      }
    }
  }`,
    )
    .join("\n")}
}
MOTION
Frames: 1
Frame Time: 0.033333
${Array(51).fill(0).join(" ")}
`;
it("keeps the body matrix while deforming the mesh for finger bends stored only in BVH offsets", () => {
  const bent = sourceFingerPose(template, frame("0 0 1"), base, skin)!;
  const straight = sourceFingerPose(template, frame("0 1 0"), base, skin)!;
  expect(bent.matrices[0]).toBe(base.matrices[0]);
  expect(bent.template.meshes[0].skinIndices[0]).toBe(6);
  expect(template.meshes[0].skinIndices[0]).toBe(0);
  const v = new THREE.Vector3(1, 3, 0);
  expect(
    v
      .clone()
      .applyMatrix4(bent.matrices[6])
      .distanceTo(new THREE.Vector3(1, 2, 1)),
  ).toBeLessThan(1e-6);
  expect(v.clone().applyMatrix4(straight.matrices[6]).distanceTo(v)).toBeLessThan(1e-6);
});
