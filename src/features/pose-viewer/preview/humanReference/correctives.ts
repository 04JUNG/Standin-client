import * as THREE from "three";
import type { HumanTemplate } from "./template";
import type { referencePose } from "./pose";

type Expression = number | string | [string, ...Expression[]];
type Variable = ["q", number, number] | ["property", string];
type Rule = { expression: Expression; variables: Record<string, Variable> };
export type Correctives = {
  restRotations: number[][];
  drivers: (Rule & { target: Variable })[];
  lifts: (Rule & { joint: number; direction: number[] })[];
  shapes: (Rule & { name: string; offsets: [number, number, number, number][] })[];
};
const operations: Record<string, (...args: number[]) => number> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  pow: Math.pow,
  neg: (a) => -a,
  gte: (a, b) => Number(a >= b),
  if: (c, a, b) => (c ? a : b),
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  asin: Math.asin,
  atan2: Math.atan2,
};
function evaluate(expr: Expression, vars: Record<string, number>): number {
  if (typeof expr === "number") return expr;
  if (typeof expr === "string") {
    if (!Object.prototype.hasOwnProperty.call(vars, expr))
      throw Error("Unknown corrective variable");
    return vars[expr];
  }
  if (!Object.prototype.hasOwnProperty.call(operations, expr[0]))
    throw Error("Unknown corrective operation");
  const value = operations[expr[0]](...expr.slice(1).map((x) => evaluate(x, vars)));
  if (!Number.isFinite(value)) throw Error("Invalid corrective value");
  return value;
}

/** Evaluate the pinned authoring rig and sparse PSDs locally. No scripts/eval,
 * network or authoring runtime are involved. Upper-arm world angles are retained
 * while the driven clavicle and scapular lift move their sockets, as in export. */
export function correctApprovedPose(
  template: HumanTemplate,
  pose: ReturnType<typeof referencePose>,
  data: Correctives,
) {
  const rest = data.restRotations.map((q) => new THREE.Quaternion().fromArray(q));
  const rotations = pose.rotations.map((q) => q.clone());
  const local = rest.map(() => new THREE.Quaternion());
  const properties: Record<string, number> = { StandinShoulderFollow: 1 };
  function localRotations() {
    for (const [i, joint] of template.joints.entries()) {
      const parent = joint.parent < 0 ? new THREE.Quaternion() : rotations[joint.parent];
      local[i]
        .copy(rest[i])
        .invert()
        .multiply(parent.clone().invert())
        .multiply(rotations[i])
        .multiply(rest[i])
        .normalize();
    }
  }
  function value(rule: Rule) {
    const vars: Record<string, number> = {};
    for (const [name, v] of Object.entries(rule.variables)) {
      vars[name] = v[0] === "property" ? properties[v[1]] : local[v[1]].toArray()[v[2]];
      if (!Number.isFinite(vars[name])) throw Error("Missing corrective input");
    }
    return evaluate(rule.expression, vars);
  }
  const driven = [
    ...new Set(data.drivers.filter((d) => d.target[0] === "q").map((d) => d.target[1] as number)),
  ];
  for (let iteration = 0; iteration < 24; iteration++) {
    localRotations();
    for (const rule of data.drivers) {
      const v = value(rule),
        target = rule.target;
      if (target[0] === "property") properties[target[1]] = v;
      else {
        const q = local[target[1]].toArray();
        q[target[2]] = v;
        local[target[1]].fromArray(q);
      }
    }
    let change = 0;
    for (const i of driven) {
      const parent = rotations[template.joints[i].parent] ?? new THREE.Quaternion();
      const next = parent
        .clone()
        .multiply(rest[i])
        .multiply(local[i])
        .multiply(rest[i].clone().invert())
        .normalize();
      change = Math.max(change, rotations[i].angleTo(next));
      rotations[i] = next;
    }
    if (change < 1e-7) break;
  }
  localRotations();
  // Refresh scalar channels at the converged arm rotations before PSD evaluation.
  for (const rule of data.drivers)
    if (rule.target[0] === "property") properties[rule.target[1]] = value(rule);
  const offsets = new Map(
    data.lifts.map((rule) => [
      rule.joint,
      new THREE.Vector3().fromArray(rule.direction).multiplyScalar(value(rule)),
    ]),
  );
  const positions: THREE.Vector3[] = [],
    matrices: THREE.Matrix4[] = [];
  for (const [i, joint] of template.joints.entries()) {
    const p = joint.parent,
      head = new THREE.Vector3().fromArray(joint.head);
    const position =
      p < 0
        ? new THREE.Vector3()
        : head
            .clone()
            .sub(new THREE.Vector3().fromArray(template.joints[p].head))
            .add(offsets.get(i) ?? new THREE.Vector3())
            .applyQuaternion(rotations[p])
            .add(positions[p]);
    positions.push(position);
    matrices.push(
      new THREE.Matrix4().compose(
        position.clone().sub(head.applyQuaternion(rotations[i])),
        rotations[i],
        new THREE.Vector3(1, 1, 1),
      ),
    );
  }
  const meshes = template.meshes.map((mesh) => ({ ...mesh, positions: mesh.positions.slice() }));
  const active: Record<string, number> = {};
  for (const shape of data.shapes) {
    const weight = value(shape);
    active[shape.name] = weight;
    if (Math.abs(weight) < 1e-7) continue;
    for (const [i, x, y, z] of shape.offsets) {
      meshes[0].positions[i * 3] += x * weight;
      meshes[0].positions[i * 3 + 1] += y * weight;
      meshes[0].positions[i * 3 + 2] += z * weight;
    }
  }
  return {
    template: { ...template, meshes },
    pose: { ...pose, rotations, positions, matrices },
    active,
  };
}
