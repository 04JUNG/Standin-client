import * as THREE from "three";
import { expect, it } from "vitest";
import { referenceMesh } from "./referenceMesh";
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
  joints: [joint("hand.L", 1, [0, 0, 0], [0, 1, 0]), joint("forearm.L", -1, [0, -1, 0], [0, 0, 0])],
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
      joint(digit + j + ".L", j === 1 ? 0 : i * 3 + j, [2 - i, j, 0], [2 - i, j + 1, 0]),
    ),
  ),
  weights: [[[0, [[7, 1]]]]],
};
const base = {
  positions: [new THREE.Vector3(), new THREE.Vector3(0, -1, 0)],
  rotations: [new THREE.Quaternion(), new THREE.Quaternion()],
  matrices: [new THREE.Matrix4(), new THREE.Matrix4()],
  roles: ["hand.L", "forearm.L"],
};
const frame = (indexThirdOffset: string, palmTwist = 0) => `HIERARCHY
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
0 0 0 0 0 ${palmTwist} ${Array(45).fill(0).join(" ")}
`;
it("keeps the body matrix while deforming the mesh for finger bends stored only in BVH offsets", () => {
  const bent = sourceFingerPose(template, frame("0 0 1"), base, skin)!;
  const straight = sourceFingerPose(template, frame("0 1 0"), base, skin)!;
  expect(bent.matrices[1]).toBe(base.matrices[1]);
  expect(bent.template.meshes[0].skinIndices[0]).toBe(7);
  expect(template.meshes[0].skinIndices[0]).toBe(0);
  const v = new THREE.Vector3(1, 3, 0);
  expect(
    v
      .clone()
      .applyMatrix4(bent.matrices[7])
      .distanceTo(new THREE.Vector3(1, 2, 1)),
  ).toBeLessThan(1e-6);
  expect(v.clone().applyMatrix4(straight.matrices[7]).distanceTo(v)).toBeLessThan(1e-6);
});

it("carries palm twist into the wrist and bent fingers without moving the wrist joint", () => {
  const twist = 62;
  const wristHead = new THREE.Vector3(3, 4, 5);
  const solved = { ...base, positions: [wristHead, base.positions[1]] };
  const result = sourceFingerPose(template, frame("0 0 1", twist), solved, skin)!;
  const rotate = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(twist),
  );
  const across = new THREE.Vector3(1, 0, 0);
  expect(
    across.clone().transformDirection(result.matrices[0]).angleTo(across.applyQuaternion(rotate)),
  ).toBeLessThan(1e-6);
  expect(new THREE.Vector3().applyMatrix4(result.matrices[0]).distanceTo(wristHead)).toBeLessThan(
    1e-6,
  );
  const bentTip = new THREE.Vector3(1, 2, 1).applyQuaternion(rotate).add(wristHead);
  expect(
    new THREE.Vector3(1, 3, 0).applyMatrix4(result.matrices[7]).distanceTo(bentTip),
  ).toBeLessThan(1e-6);
  expect(result.matrices[1]).toBe(base.matrices[1]);
});

it("preserves wrist thickness where the hand and forearm share a vertex", () => {
  const wristTemplate = {
    ...template,
    meshes: [{ ...template.meshes[0], positions: [1, 0, 0] }],
  };
  const wristSkin: FingerSkin = {
    ...skin,
    weights: [
      [
        [
          0,
          [
            [0, 0.5],
            [1, 0.5],
          ],
        ],
      ],
    ],
  };
  const pose = sourceFingerPose(wristTemplate, frame("0 1 0", 160), base, wristSkin)!;
  const surface = referenceMesh(pose.template, pose.matrices, pose.wrists);
  try {
    const mesh = surface.body.children[0] as THREE.Mesh;
    const vertex = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0);
    const expected = new THREE.Vector3(1, 0, 0).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(80),
    );
    expect(vertex.distanceTo(expected)).toBeLessThan(1e-6);
  } finally {
    surface.release();
  }
});
