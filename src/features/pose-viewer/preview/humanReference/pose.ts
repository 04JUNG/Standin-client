import * as THREE from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import type { HumanTemplate } from "./template";
const key = (name: string) =>
  name
    .split(":")
    .pop()!
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
const preferred: Record<string, string[]> = {
  hips: ["spine"],
  spine: ["spine1", "spine2", "neck"],
  spine1: ["spine2", "neck"],
  spine2: ["neck"],
  neck: ["head"],
};
for (const side of ["L", "R"])
  for (const chain of [
    ["shoulder", "upperarm", "forearm", "hand"],
    ["upleg", "leg", "foot", "toe"],
  ])
    chain.slice(0, -1).forEach((r, i) => {
      preferred[r + "." + side] = [chain[i + 1] + "." + side];
    });
const required = [
  "hips",
  "spine",
  "neck",
  "head",
  "upperarm.L",
  "forearm.L",
  "upperarm.R",
  "forearm.R",
  "upleg.L",
  "leg.L",
  "upleg.R",
  "leg.R",
];
export function referencePose(template: HumanTemplate, text: string) {
  if (
    !text.startsWith("HIERARCHY") ||
    text.length > 2_000_000 ||
    (text.match(/\bJOINT\b/g)?.length ?? 0) > 500
  )
    throw Error("지원하지 않는 BVH 참고 형식입니다.");
  const frames = Number(text.match(/Frames:\s*(\d+)/)?.[1]);
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > 10000)
    throw Error("BVH 프레임을 확인하지 못했습니다.");
  const parsed = new BVHLoader().parse(text.replace(/([{}])/g, "\n$1\n"));
  const root = parsed.skeleton.bones[0];
  root.updateMatrixWorld(true);
  const bones = parsed.skeleton.bones;
  const rest = new Map(bones.map((b) => [b, b.getWorldPosition(new THREE.Vector3())]));
  const byName = new Map(bones.map((b) => [b.name, b]));
  for (const track of parsed.clip.tracks) {
    const split = track.name.lastIndexOf(".");
    const bone = byName.get(track.name.slice(0, split));
    if (!bone || !track.times.length) throw Error("BVH 관절을 확인하지 못했습니다.");
    if (track.name.slice(split + 1) === "position") bone.position.fromArray(track.values, 0);
    else if (track.name.slice(split + 1) === "quaternion")
      bone.quaternion.fromArray(track.values, 0);
    else throw Error("지원하지 않는 BVH 채널입니다.");
  }
  root.updateMatrixWorld(true);
  const lookup = new Map(bones.map((b) => [key(b.name), b]));
  const profile = Object.values(template.profiles)
    .map((p) => ({
      p,
      hit: Object.values(p).filter((n) => lookup.has(key(n))).length,
      missing: required.filter((r) => !p[r] || !lookup.has(key(p[r]))).length,
    }))
    .sort((a, b) => b.hit - a.hit || a.missing - b.missing)[0];
  if (!profile || profile.hit < 10 || profile.missing > 0)
    throw Error("기본 인체 참고에 필요한 관절이 없습니다.");
  const source = (role: string) => (profile.p[role] ? lookup.get(key(profile.p[role])) : undefined);
  const rotations: THREE.Quaternion[] = [],
    positions: THREE.Vector3[] = [],
    matrices: THREE.Matrix4[] = [];
  const restHeads = template.joints.map((j) => new THREE.Vector3().fromArray(j.head));
  for (const [i, joint] of template.joints.entries()) {
    const bone = source(joint.role);
    const parent = joint.parent;
    const q = bone
      ? bone.getWorldQuaternion(new THREE.Quaternion())
      : parent >= 0
        ? rotations[parent].clone()
        : new THREE.Quaternion();
    if (bone) {
      const child =
        (preferred[joint.role] ?? []).map(source).find(Boolean) ??
        (bone.children[0] as THREE.Bone | undefined);
      const target = (preferred[joint.role] ?? [])
        .map((r) => template.joints.findIndex((j) => j.role === r))
        .find((n) => n >= 0);
      const neutralDir = (
        target !== undefined ? restHeads[target] : new THREE.Vector3().fromArray(joint.tail)
      )
        .clone()
        .sub(restHeads[i]);
      const sourceDir =
        child && rest.has(child) ? rest.get(child)!.clone().sub(rest.get(bone)!) : undefined;
      if (sourceDir && sourceDir.lengthSq() > 1e-12 && neutralDir.lengthSq() > 1e-12)
        q.multiply(
          new THREE.Quaternion().setFromUnitVectors(neutralDir.normalize(), sourceDir.normalize()),
        );
    }
    const position =
      parent < 0
        ? new THREE.Vector3()
        : restHeads[i]
            .clone()
            .sub(restHeads[parent])
            .applyQuaternion(rotations[parent])
            .add(positions[parent]);
    const translation = position.clone().sub(restHeads[i].clone().applyQuaternion(q));
    const m = new THREE.Matrix4().compose(translation, q, new THREE.Vector3(1, 1, 1));
    if (!m.elements.every(Number.isFinite)) throw Error("포즈 변환 값이 유효하지 않습니다.");
    rotations.push(q);
    positions.push(position);
    matrices.push(m);
  }
  return { matrices, positions, rotations, roles: template.joints.map((j) => j.role) };
}
/** CPU bounding box uses the same eight skin influences as the GPU. */
export function referenceBounds(template: HumanTemplate, matrices: THREE.Matrix4[]) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3(),
    mixed = new THREE.Vector3();
  for (const mesh of template.meshes)
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      mixed.set(0, 0, 0);
      for (let k = 0; k < 8; k++) {
        const w = mesh.skinWeights[i * 8 + k];
        if (!w) continue;
        point.fromArray(mesh.positions, i * 3).applyMatrix4(matrices[mesh.skinIndices[i * 8 + k]]);
        mixed.addScaledVector(point, w);
      }
      bounds.expandByPoint(mixed);
    }
  if (bounds.isEmpty() || bounds.getSize(point).length() > 100)
    throw Error("기본 인체 크기가 유효하지 않습니다.");
  return bounds;
}
