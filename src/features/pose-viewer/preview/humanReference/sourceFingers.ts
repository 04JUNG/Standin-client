import * as THREE from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import { gunzipSync, strFromU8 } from "fflate";
import type { referencePose } from "./pose";
import type { HumanTemplate } from "./template";
import type { WristBlend } from "./referenceMesh";
import full from "./fingerAssets/full.json.gz?url";
import half from "./fingerAssets/half.json.gz?url";

const digits = ["thumb", "index", "middle", "ring", "pinky"] as const;
const assets = { full, half };
export type FingerSkin = {
  baseSha: string;
  joints: HumanTemplate["joints"];
  weights: [number, [number, number][]][][];
};
const skins = new Map<string, Promise<FingerSkin | undefined>>();

export async function loadFingerSkin(scope: string, digest: string | undefined) {
  if (!digest || (scope !== "full" && scope !== "half")) return undefined;
  if (!skins.has(scope)) {
    const pending = fetch(assets[scope])
      .then(async (response) => {
        if (!response.ok) throw Error("missing finger weights");
        return JSON.parse(
          strFromU8(gunzipSync(new Uint8Array(await response.arrayBuffer()))),
        ) as FingerSkin;
      })
      .catch(() => {
        skins.delete(scope);
        return undefined;
      });
    skins.set(scope, pending);
  }
  const skin = await skins.get(scope);
  return skin?.baseSha === digest ? skin : undefined;
}

const key = (name: string) =>
  name
    .split(":")
    .pop()!
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
const vector = (point: number[]) => new THREE.Vector3().fromArray(point);
function palm(
  wrist: THREE.Vector3,
  index: THREE.Vector3,
  middle: THREE.Vector3,
  pinky: THREE.Vector3,
) {
  const length = middle.clone().sub(wrist);
  const across = index.clone().sub(pinky);
  if (!(length.lengthSq() > 1e-12) || !Number.isFinite(length.lengthSq())) return undefined;
  length.normalize();
  across.addScaledVector(length, -across.dot(length));
  if (!(across.lengthSq() > 1e-12) || !Number.isFinite(across.lengthSq())) return undefined;
  across.normalize();
  return new THREE.Matrix4().makeBasis(across, length, across.clone().cross(length));
}

/** Reuse the body solve and wrist positions. Read palm orientation and finger
 * directions from the posed BVH, including bends stored in static offsets. */
export function sourceFingerPose(
  template: HumanTemplate,
  text: string,
  base: Pick<ReturnType<typeof referencePose>, "positions" | "rotations" | "matrices" | "roles">,
  skin: FingerSkin,
) {
  const { skeleton, clip } = new BVHLoader().parse(text.replace(/([{}])/g, "\n$1\n"));
  const root = skeleton.bones[0];
  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  const lookup = new Map(skeleton.bones.map((b) => [key(b.name), b]));
  for (const track of clip.tracks) {
    const separator = track.name.lastIndexOf(".");
    const bone = byName.get(track.name.slice(0, separator));
    if (!bone) continue;
    if (track.name.endsWith(".position")) bone.position.fromArray(track.values);
    if (track.name.endsWith(".quaternion")) bone.quaternion.fromArray(track.values);
  }
  root.updateMatrixWorld(true);
  const posed = (bone: THREE.Bone) => bone.getWorldPosition(new THREE.Vector3());
  const joints = [...template.joints, ...skin.joints];
  const byRole = new Map(joints.map((j, i) => [j.role, i]));
  const directions = new Map<number, THREE.Vector3>();
  const wristTurns = new Map<number, THREE.Quaternion>();
  for (const side of ["L", "R"]) {
    const label = side === "L" ? "left" : "right";
    const suffix = side.toLowerCase();
    const find = (...names: string[]) => names.map((n) => lookup.get(n)).find(Boolean);
    const wrist = find(label + "hand", label + "wrist", "hand" + suffix);
    const source = (digit: string, i: number) =>
      find(label + "hand" + digit + i, digit + "0" + i + suffix);
    const index = source("index", 1);
    const middle = source("middle", 1);
    const pinky = source("pinky", 1);
    const wristId = byRole.get("hand." + side);
    if (!wrist || !index || !middle || !pinky || wristId === undefined) continue;
    const sourceBasis = palm(posed(wrist), posed(index), posed(middle), posed(pinky));
    const target = (digit: string, i: number) => byRole.get(digit + i + "." + side)!;
    const targetBasis = palm(
      vector(joints[wristId].head),
      vector(joints[target("index", 1)].head),
      vector(joints[target("middle", 1)].head),
      vector(joints[target("pinky", 1)].head),
    );
    if (!sourceBasis || !targetBasis) continue;
    // A wrist-to-one-child direction cannot determine the twist of the palm.
    wristTurns.set(
      wristId,
      new THREE.Quaternion().setFromRotationMatrix(sourceBasis.multiply(targetBasis.invert())),
    );
    for (const digit of digits)
      for (const i of [1, 2, 3]) {
        const bone = source(digit, i);
        const child =
          i < 3 ? source(digit, i + 1) : bone?.children.find((b) => b.name === "ENDSITE");
        if (!bone || !(child instanceof THREE.Bone) || child.parent !== bone) continue;
        const segment = posed(child).sub(posed(bone));
        if (segment.lengthSq() > 1e-12) directions.set(target(digit, i), segment.normalize());
      }
  }
  if (!wristTurns.size) return undefined;

  const { matrices, positions, rotations } = base;
  const out = [...matrices];
  const heads = [...positions];
  const turns = [...rotations];
  const wrists: WristBlend[] = [];
  for (const [i, turn] of wristTurns) {
    const wrist = joints[i];
    const rest = vector(wrist.head);
    const position = heads[i];
    const translation = position.clone().sub(rest.clone().applyQuaternion(turn));
    turns[i] = turn;
    out[i] = new THREE.Matrix4().compose(translation, turn, new THREE.Vector3(1, 1, 1));
    if (joints[wrist.parent]?.role === wrist.role.replace("hand.", "forearm.")) {
      wrists.push({ forearm: wrist.parent, hand: i, rest, position });
    }
  }
  for (const [local, joint] of skin.joints.entries()) {
    const i = template.joints.length + local;
    const parent = joint.parent;
    const head = vector(joint.head);
    const position = head
      .clone()
      .sub(vector(joints[parent].head))
      .applyQuaternion(turns[parent])
      .add(heads[parent]);
    const turn = turns[parent].clone();
    const desired = directions.get(i);
    if (desired) {
      const next = joints[i + 1];
      const tip = next?.parent === i ? next.head : joint.tail;
      const current = vector(tip).sub(head).applyQuaternion(turn);
      if (current.lengthSq() > 1e-12)
        turn.premultiply(new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired));
    }
    const translation = position.clone().sub(head.applyQuaternion(turn));
    turns.push(turn);
    heads.push(position);
    out.push(new THREE.Matrix4().compose(translation, turn, new THREE.Vector3(1, 1, 1)));
  }
  const meshes = template.meshes.map((mesh, index) => {
    const skinIndices = mesh.skinIndices.slice();
    const skinWeights = mesh.skinWeights.slice();
    for (const [vertex, weights] of skin.weights[index]) {
      for (let k = 0; k < 8; k++) {
        skinIndices[vertex * 8 + k] = weights[k]?.[0] ?? 0;
        skinWeights[vertex * 8 + k] = weights[k]?.[1] ?? 0;
      }
    }
    return { ...mesh, skinIndices, skinWeights };
  });
  return { template: { ...template, joints, meshes }, matrices: out, wrists };
}
