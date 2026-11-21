import * as THREE from "three";
import { expect, it } from "vitest";
import { humanFixture, bvhFixture } from "@/test/humanReferenceFixture";
import { fitOffsetBody, isOffsetBody } from "./offsetBody";
import { referencePose } from "./pose";

function bakedFixture(rootYaw = 0) {
  const template = humanFixture();
  const names = [
    "Hips",
    "Spine",
    "Spine1",
    "Spine2",
    "Neck",
    "Head",
    "LeftShoulder",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightShoulder",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "LeftToeBase",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
    "RightToeBase",
  ];
  template.profiles = {
    mixamo: Object.fromEntries(template.joints.map((j, i) => [j.role, `mixamorig:${names[i]}`])),
  };
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.2, 0.35));
  const heads = template.joints.map((j) =>
    new THREE.Vector3(...j.head).applyQuaternion(turn).multiplyScalar(100),
  );
  let count = 0;
  function bone(i: number): string {
    count++;
    const joint = template.joints[i];
    const offset = heads[i]
      .clone()
      .sub(joint.parent < 0 ? new THREE.Vector3() : heads[joint.parent]);
    const children = template.joints.flatMap((j, k) => (j.parent === i ? [k] : []));
    const tip = new THREE.Vector3(...joint.tail)
      .sub(new THREE.Vector3(...joint.head))
      .applyQuaternion(turn)
      .multiplyScalar(100);
    return `${joint.parent < 0 ? "ROOT" : "JOINT"} mixamorig:${names[i]}\n{\nOFFSET ${offset.toArray().join(" ")}\nCHANNELS 6 Xposition Yposition Zposition Xrotation Yrotation Zrotation\n${children.length ? children.map(bone).join("\n") : `End Site\n{\nOFFSET ${tip.toArray().join(" ")}\n}`}\n}`;
  }
  const header = bone(0);
  const values = Array(count * 6).fill(0);
  values[4] = rootYaw;
  return {
    template,
    heads,
    turn: new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(rootYaw))
      .multiply(turn),
    text: `HIERARCHY\n${header}\nMOTION\nFrames: 1\nFrame Time: 0.033333\n${values.join(" ")}\n`,
  };
}

it("transfers baked-offset head, torso, pelvis and limbs while retaining target lengths", () => {
  const { template, text, turn } = bakedFixture(15);
  expect(isOffsetBody(text)).toBe(true);
  const base = referencePose(template, text, true);
  expect(base.bakedOffsets).toBe(false);
  const before = base.rotations.map((q) => q.toArray());
  const fixed = fitOffsetBody(template, base);
  const head = fixed.roles.indexOf("head");
  expect(base.rotations[head].angleTo(turn)).toBeGreaterThan(0.3);
  const headAxis = new THREE.Vector3(...template.joints[head].tail).sub(
    new THREE.Vector3(...template.joints[head].head),
  );
  expect(
    headAxis
      .clone()
      .applyQuaternion(fixed.rotations[head])
      .angleTo(headAxis.clone().applyQuaternion(turn)),
  ).toBeLessThan(0.01);
  for (const [i, joint] of template.joints.entries()) {
    const rest = new THREE.Vector3(...joint.head);
    expect(
      rest.clone().applyMatrix4(fixed.matrices[i]).distanceTo(fixed.positions[i]),
    ).toBeLessThan(1e-7);
    if (joint.parent < 0) continue;
    const edge = rest.sub(new THREE.Vector3(...template.joints[joint.parent].head));
    const actual = fixed.positions[i].clone().sub(fixed.positions[joint.parent]);
    expect(actual.length()).toBeCloseTo(edge.length(), 7);
    expect(actual.angleTo(edge.applyQuaternion(turn)), joint.role).toBeLessThan(0.01);
  }
  expect(base.rotations.map((q) => q.toArray())).toEqual(before);
});

it("retains the upstream authored-geometry path without a second body transfer", () => {
  const { template, text, turn } = bakedFixture();
  expect(isOffsetBody(text)).toBe(true);
  const base = referencePose(template, text, true);
  expect(base.bakedOffsets).toBe(true);
  expect(base.offsetBody).toBeUndefined();
  expect(fitOffsetBody(template, base)).toBe(base);
  for (const [i, joint] of template.joints.entries()) {
    if (joint.parent < 0) continue;
    const expected = new THREE.Vector3(...joint.head)
      .sub(new THREE.Vector3(...template.joints[joint.parent].head))
      .applyQuaternion(turn);
    const actual = base.positions[i].clone().sub(base.positions[joint.parent]);
    expect(actual.distanceTo(expected), joint.role).toBeLessThan(1e-6);
  }
});

it("keeps ordinary motion BVHs unchanged and rejects non-delta six-channel formats", () => {
  const { template, text } = bakedFixture();
  expect(isOffsetBody(bvhFixture())).toBe(false);
  expect(isOffsetBody(text.replace("Frames: 1", "Frames: 2"))).toBe(false);
  const lines = text.trimEnd().split("\n");
  const values = lines.pop()!.split(" ");
  values[6] = "100";
  expect(isOffsetBody([...lines, values.join(" ")].join("\n"))).toBe(false);
  const base = referencePose(template, text, false);
  expect(fitOffsetBody(template, base)).toBe(base);
});
