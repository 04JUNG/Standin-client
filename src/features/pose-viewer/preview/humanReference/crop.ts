import { ShapeUtils, Vector2 } from "three";
import type { HumanTemplate } from "./template";

type Mesh = HumanTemplate["meshes"][number];
export type CutVertex = { index: number; a: number; b: number; t: number };
const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

export function mixWeights(a: number[][], b: number[][], t: number): [number, number][] {
  const mixed = new Map<number, number>();
  for (const [weights, scale] of [
    [a, 1 - t],
    [b, t],
  ] as const)
    for (const [joint, weight] of weights)
      mixed.set(joint, (mixed.get(joint) ?? 0) + weight * scale);
  const weights = [...mixed]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  return weights.map(([joint, weight]) => [joint, weight / total]);
}

/** Clip at a real plane, then close each rim. Original vertex IDs stay stable;
 * new edge vertices also interpolate finger weights and PSDs in scopedModel. */
export function cropReferenceMesh(mesh: Mesh, cut: number) {
  const positions = mesh.positions.slice(),
    normals = mesh.normals.slice();
  const skinIndices = mesh.skinIndices.slice(),
    skinWeights = mesh.skinWeights.slice();
  const inserted: CutVertex[] = [];
  const intersections = new Map<string, number>();
  const weightsAt = (i: number) =>
    Array.from({ length: 8 }, (_, k) => [mesh.skinIndices[i * 8 + k], mesh.skinWeights[i * 8 + k]]);
  function intersect(a: number, b: number) {
    if (mesh.positions[a * 3 + 1] === cut) return a;
    if (mesh.positions[b * 3 + 1] === cut) return b;
    const key = edgeKey(a, b);
    const cached = intersections.get(key);
    if (cached !== undefined) return cached;
    const t =
      (cut - mesh.positions[a * 3 + 1]) / (mesh.positions[b * 3 + 1] - mesh.positions[a * 3 + 1]);
    const index = positions.length / 3;
    for (let k = 0; k < 3; k++) {
      positions.push(
        k === 1 ? cut : mesh.positions[a * 3 + k] * (1 - t) + mesh.positions[b * 3 + k] * t,
      );
      normals.push(mesh.normals[a * 3 + k] * (1 - t) + mesh.normals[b * 3 + k] * t);
    }
    const weights = mixWeights(weightsAt(a), weightsAt(b), t);
    for (let k = 0; k < 8; k++) {
      skinIndices.push(weights[k]?.[0] ?? 0);
      skinWeights.push(weights[k]?.[1] ?? 0);
    }
    inserted.push({ index, a, b, t });
    intersections.set(key, index);
    return index;
  }
  const triangles: number[] = [];
  const edges = new Map<string, { a: number; b: number; count: number }>();
  function face(a: number, b: number, c: number) {
    if (a === b || b === c || c === a) return;
    triangles.push(a, b, c);
    const vertices = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const a = vertices[k],
        b = vertices[(k + 1) % 3];
      // Only a cut-plane edge can need a cap. Avoid building a whole-body
      // adjacency table on this latency-sensitive, cached preview path.
      if (positions[a * 3 + 1] !== cut || positions[b * 3 + 1] !== cut) continue;
      const key = edgeKey(a, b),
        edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  }
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const source = mesh.triangles.slice(i, i + 3);
    const clipped: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = source[k],
        b = source[(k + 1) % 3];
      const insideA = mesh.positions[a * 3 + 1] >= cut;
      const insideB = mesh.positions[b * 3 + 1] >= cut;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) clipped.push(intersect(a, b));
    }
    for (let k = 1; k < clipped.length - 1; k++) face(clipped[0], clipped[k], clipped[k + 1]);
  }
  // Retained faces are consistently wound. Reverse their boundary edges so the
  // cap faces outward, including when the cut has several disconnected loops.
  const next = new Map<number, number>();
  for (const { a, b, count } of edges.values())
    if (count === 1) {
      if (next.has(b)) throw Error("미리보기 절단면을 확인하지 못했습니다.");
      next.set(b, a);
    }
  while (next.size) {
    const start = next.keys().next().value!;
    const rim: number[] = [];
    let vertex = start;
    do {
      const following = next.get(vertex);
      if (following === undefined) throw Error("미리보기 절단면이 닫히지 않았습니다.");
      rim.push(vertex);
      next.delete(vertex);
      vertex = following;
    } while (vertex !== start);
    const contour = rim.map((i) => new Vector2(positions[i * 3], positions[i * 3 + 2]));
    const clockwise = ShapeUtils.isClockWise(contour);
    for (const face of ShapeUtils.triangulateShape(contour, [])) {
      const [a, b, c] = face.map((i) => contour[i]);
      const faceClockwise = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
      if (faceClockwise !== clockwise) face.reverse();
      triangles.push(...face.map((i) => rim[i]));
    }
  }
  return { mesh: { positions, normals, skinIndices, skinWeights, triangles }, inserted };
}
