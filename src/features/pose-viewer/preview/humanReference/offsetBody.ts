import * as THREE from "three";
import type { HumanTemplate } from "./template";
import type { referencePose } from "./pose";

export type OffsetBody = { heads: Map<string, THREE.Vector3>; ends: Map<string, THREE.Vector3> };

/** Same bounded single-frame format gate as Converter._offset_delta_pose.
 * These files store the pose in OFFSETs, with near-zero XYZ channel deltas. */
export function isOffsetBody(text: string) {
  const [header, motion] = text.split(/\bMOTION\b/, 2);
  if (!motion || !/^ROOT mixamorig:Hips\s*\{/m.test(header)) return false;
  const frame = motion.match(/^\s*Frames:\s*1\s+Frame Time:[^\r\n]+\r?\n([^\r\n]+)\s*$/);
  if (!frame) return false;
  const offsets = [
    ...header.matchAll(
      /(?:ROOT|JOINT)\s+\S+\s*\{\s*OFFSET\s+(\S+)\s+(\S+)\s+(\S+)\s*CHANNELS\s+6\s+Xposition\s+Yposition\s+Zposition\s+Xrotation\s+Yrotation\s+Zrotation\b/g,
    ),
  ];
  const values = frame[1].trim().split(/\s+/).map(Number);
  if (
    offsets.length < 2 ||
    offsets.length !== (header.match(/\bCHANNELS\b/g)?.length ?? 0) ||
    values.length !== offsets.length * 6 ||
    !values.every(Number.isFinite)
  )
    return false;
  const lengths = offsets.slice(1).map((m) => Math.hypot(...m.slice(1).map(Number)));
  const scale = Math.max(...lengths);
  if (!(scale > 0) || !lengths.every(Number.isFinite)) return false;
  for (let i = 6; i < values.length; i += 6)
    if (Math.hypot(values[i], values[i + 1], values[i + 2]) > 0.0001 * scale) return false;
  return true;
}

/** Browser counterpart of Converter.source_body.apply_source_body. Transfer
 * evaluated landmarks while retaining the model's lengths and solved twist.
 * No network, server solve, or new model is needed for this library format. */
export function fitOffsetBody(template: HumanTemplate, pose: ReturnType<typeof referencePose>) {
  const source = pose.offsetBody;
  // referencePose already preserves reviewed zero-motion geometry directly.
  // Only transfer OFFSET poses with motion deltas that need the neutral path.
  if (!source || pose.bakedOffsets) return pose;
  const spine = ["spine", "spine1", "spine2", "neck", "head"];
  const limbs = ["L", "R"].flatMap((s) => [
    ["upperarm", "forearm", "hand"].map((r) => `${r}.${s}`),
    ["upleg", "leg", "foot", "toe"].map((r) => `${r}.${s}`),
  ]);
  const roles = ["hips", ...spine, "shoulder.L", "shoulder.R", ...limbs.flat()];
  const ids = new Map(template.joints.map((j, i) => [j.role, i]));
  if (roles.some((r) => !ids.has(r) || !source.heads.has(r))) return pose;
  const rotations = pose.rotations.map((q) => q.clone());
  const positions = pose.positions.map((p) => p.clone());
  const localEdges = template.joints.map((j, i) =>
    j.parent < 0
      ? positions[i].clone()
      : positions[i]
          .clone()
          .sub(positions[j.parent])
          .applyQuaternion(pose.rotations[j.parent].clone().invert()),
  );
  const descendants = template.joints.map((_, i) =>
    template.joints.flatMap((_, k) => {
      for (let p = k; p >= 0; p = template.joints[p].parent) if (p === i) return [k];
      return [];
    }),
  );
  const head = (role: string) => positions[ids.get(role)!].clone();
  const src = (role: string) => source.heads.get(role)!.clone();
  const retained = new Map(roles.map((r) => [r, rotations[ids.get(r)!].clone()]));
  function setRotation(role: string, q: THREE.Quaternion) {
    const i = ids.get(role)!;
    const delta = q.clone().multiply(rotations[i].clone().invert());
    for (const k of descendants[i]) rotations[k].premultiply(delta).normalize();
    for (const [k, j] of template.joints.entries())
      if (j.parent >= 0)
        positions[k]
          .copy(localEdges[k])
          .applyQuaternion(rotations[j.parent])
          .add(positions[j.parent]);
  }
  function align(role: string, current: THREE.Vector3, desired: THREE.Vector3) {
    if (current.length() <= 1e-6 || desired.length() <= 1e-6) return;
    const angle = current.angleTo(desired);
    // Match the frozen solver's identity and degenerate-direction guards.
    if (angle < Math.PI / 360 || angle > THREE.MathUtils.degToRad(175)) return;
    const q = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
    setRotation(role, q.multiply(rotations[ids.get(role)!]));
  }
  function alignEdge(parent: string, child: string) {
    align(parent, head(child).sub(head(parent)), src(child).sub(src(parent)));
  }
  function alignEnd(role: string) {
    const end = pose.offsetBody?.ends.get(role);
    if (!end) return;
    const i = ids.get(role)!,
      joint = template.joints[i];
    align(
      role,
      new THREE.Vector3()
        .fromArray(joint.tail)
        .sub(new THREE.Vector3().fromArray(joint.head))
        .applyQuaternion(rotations[i]),
      end.clone().sub(src(role)),
    );
  }
  function pelvisFrame(point: (r: string) => THREE.Vector3) {
    const left = point("upleg.L"),
      right = point("upleg.R");
    const lateral = right.clone().sub(left);
    const y = point("spine").sub(left.add(right).multiplyScalar(0.5));
    const z = lateral.cross(y);
    if (y.length() <= 1e-6 || z.length() <= 1e-6) return;
    y.normalize();
    z.addScaledVector(y, -z.dot(y)).normalize();
    const x = y.clone().cross(z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y).normalize()),
    );
  }
  const desired = pelvisFrame(src),
    current = pelvisFrame(head);
  if (desired && current)
    setRotation("hips", desired.multiply(current.invert()).multiply(rotations[ids.get("hips")!]));
  for (let i = 0; i < 3; i++) alignEdge(spine[i], spine[i + 1]);
  const axis = head("neck").sub(head("spine2")).normalize();
  const across = head("upperarm.R").sub(head("upperarm.L"));
  const wanted = src("upperarm.R").sub(src("upperarm.L"));
  align(
    "spine2",
    across.addScaledVector(axis, -across.dot(axis)),
    wanted.addScaledVector(axis, -wanted.dot(axis)),
  );
  alignEdge("neck", "head");
  setRotation("head", retained.get("head")!);
  alignEnd("head");
  for (const side of ["L", "R"]) alignEdge(`shoulder.${side}`, `upperarm.${side}`);
  for (const limb of limbs) {
    for (let i = 0; i < limb.length - 1; i++) {
      setRotation(limb[i], retained.get(limb[i])!);
      alignEdge(limb[i], limb[i + 1]);
    }
    const end = limb[limb.length - 1];
    setRotation(end, retained.get(end)!);
    if (end.startsWith("toe.")) alignEnd(end);
  }
  const matrices = template.joints.map((j, i) =>
    new THREE.Matrix4().compose(
      positions[i].clone().sub(new THREE.Vector3().fromArray(j.head).applyQuaternion(rotations[i])),
      rotations[i],
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return { ...pose, rotations, positions, matrices };
}
