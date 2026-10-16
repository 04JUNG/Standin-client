import type { ShapeRuntime } from "./format";
import { smooth, type BlenderControls } from "./common";
import { coefficients, restBody, warpBody, weightSets } from "./male067";

/**
 * standin-body-0.6.10(남성) 중립 체형 계산. 0.6.7 계산에 근육 볼륨(`muscle_bulk`)이 더해졌다.
 * 근육 볼륨이 0이면 0.6.7과 같은 식이다(0.6.8~0.6.10의 나머지 변경은 자세 보정이라 중립 체형과 무관).
 *
 * 근육 볼륨 > 0일 때 (standin_body.py 0.6.10):
 *   1. compose_body: 근육 키 가중치를 더 올리고, 늘어난 만큼의 변위만 8회 평활(BK: 필드로 미리 구움).
 *   2. muscle_bulk_offset: warp 직전에 팔·다리 뼈 축에서 바깥으로 두께를 더하고 몸통 폭·등을 넓힌 뒤
 *      메시 위에서 6회 평활한다(정점별 표 MB, 평활은 여기서 계산).
 *   3. refine_bulk_profile: 근육 볼륨 0의 결과와의 차이로 다리 앞뒤 두께를 덜고 팔 두께를 더한다(표 RB).
 *
 * fold_guard(면 뒤집힘 수리)도 옮겼다. 근육 볼륨이 크면 실제로 동작한다(벌크형: 오른쪽 어깨 앞,
 * 빼면 최대 8mm 차이와 접힌 면이 남는다). 근육 볼륨 0에서는 굽는 쪽 검증 140조합 중 한 번도
 * 동작하지 않아 0.6.7처럼 검사를 건너뛴다(scripts/shape-runtime의 fold_guard 보고로 확인).
 */
export const MALE_0610 = "standin-body-0.6.10";
const MUSCLE_PARTS = new Set(["D", "SM", "DM", "SMM"]);
const MB_WIDTH = 12; // K, Q(3), 왼쪽 UpLeg k·p(3), 오른쪽 UpLeg k·p(3)
const RB_WIDTH = 2; // y, z 배율

export function evaluateMale0610(runtime: ShapeRuntime, c: BlenderControls, out: Float32Array) {
  const bulk = c.muscle_bulk ?? 0;
  const zeroControls = { ...c, muscle_bulk: 0 };
  const zero = weightSets(runtime, zeroControls);
  const zeroA = coefficients(runtime, zeroControls, zero.weights);
  const zeroB = coefficients(runtime, zeroControls, zero.legacy);
  if (!(bulk > 0)) return warpBody(runtime, c, restBody(runtime, c, zeroA, zeroB), out);
  // compute(): reference = warp(basis)는 면 방향의 기준, guard_reference = compute(근육 볼륨 0)은
  // 수리와 refine의 기준이다.
  const reference = warpBody(runtime, c, runtime.basis, new Float32Array(out.length));
  const guard = warpBody(
    runtime,
    zeroControls,
    restBody(runtime, zeroControls, zeroA, zeroB),
    new Float32Array(out.length),
  );

  const { weights, legacy } = weightSets(runtime, c);
  const body = restBody(
    runtime,
    c,
    withBulk(zeroA, coefficients(runtime, c, weights)),
    withBulk(zeroB, coefficients(runtime, c, legacy)),
  );
  bulkOffset(runtime, c, body);
  warpBody(runtime, c, body, out);
  const normals = faceNormals(runtime, guard, reference);
  foldGuard(runtime, guard, out, normals);

  // refine_bulk_profile: 근육 볼륨 0 결과(같은 키·비율)와의 차이로만 고친다.
  const [index, values] = table(runtime, "RB", RB_WIDTH);
  for (let j = 0; j < index.length; j++) {
    const v = index[j]! * 3;
    const y = out[v + 1]!,
      z = out[v + 2]!;
    out[v + 1] = y + (y - guard[v + 1]!) * values[j * RB_WIDTH]!;
    out[v + 2] = z + (z - guard[v + 2]!) * values[j * RB_WIDTH + 1]!;
  }
  return foldGuard(runtime, guard, out, normals);
}

/** 면마다 기준 두 개(guard, reference)의 법선 — 접힘 검사 두 번이 함께 쓴다. 버퍼는 자산마다 재사용. */
const NORMALS = new WeakMap<ShapeRuntime, Float64Array>();
function faceNormals(runtime: ShapeRuntime, base: Float32Array, normalRef: Float32Array) {
  let out = NORMALS.get(runtime);
  if (!out) NORMALS.set(runtime, (out = new Float64Array((runtime.faces.length / 3) * 6)));
  normalsInto(runtime.faces, base, out, 0);
  normalsInto(runtime.faces, normalRef, out, 3);
  return out;
}

function normalsInto(faces: Uint16Array, q: Float32Array, out: Float64Array, k: number) {
  const nf = faces.length / 3;
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 3]! * 3,
      b = faces[f * 3 + 1]! * 3,
      c = faces[f * 3 + 2]! * 3;
    const ux = q[b]! - q[a]!,
      uy = q[b + 1]! - q[a + 1]!,
      uz = q[b + 2]! - q[a + 2]!,
      vx = q[c]! - q[a]!,
      vy = q[c + 1]! - q[a + 1]!,
      vz = q[c + 2]! - q[a + 2]!;
    out[f * 6 + k] = uy * vz - uz * vy;
    out[f * 6 + k + 1] = uz * vx - ux * vz;
    out[f * 6 + k + 2] = ux * vy - uy * vx;
  }
}

/**
 * standin_body.fold_guard(max_rings=6, normal_reference): 기준(base)이나 normalRef와 방향이
 * 반대인 면을 찾아, 그 둘레(2고리, 안 되면 1고리씩 넓힘)의 변위를 이웃 평균 쪽으로 풀고 필요하면
 * 기준 쪽으로 줄인다. body를 제자리에서 고친다. 바뀌는 건 구역 정점뿐이라 검사도 구역에 닿는
 * 면만 다시 한다(Blender의 전체 검사와 결과가 같다). normals = faceNormals(base, normalRef).
 */
function foldGuard(
  runtime: ShapeRuntime,
  base: Float32Array,
  body: Float32Array,
  normals: Float64Array,
  maxIterations = 30,
  maxRings = 6,
) {
  const { faces } = runtime;
  const V = runtime.header.vertexCount;
  const nf = faces.length / 3;
  const p = Float64Array.from(body);
  // 면 법선 · 기준 법선 ≤ 0 이면 뒤집힘. 매 체형 변경마다 5만 면을 보므로 풀어서 쓴다.
  const flipped = (f: number) => {
    const a = faces[f * 3]! * 3,
      b = faces[f * 3 + 1]! * 3,
      c = faces[f * 3 + 2]! * 3;
    const ux = p[b]! - p[a]!,
      uy = p[b + 1]! - p[a + 1]!,
      uz = p[b + 2]! - p[a + 2]!,
      vx = p[c]! - p[a]!,
      vy = p[c + 1]! - p[a + 1]!,
      vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const o = f * 6;
    return (
      normals[o]! * nx + normals[o + 1]! * ny + normals[o + 2]! * nz <= 0 ||
      normals[o + 3]! * nx + normals[o + 4]! * ny + normals[o + 5]! * nz <= 0
    );
  };
  const zone = new Uint8Array(V);
  let bad: number[] = [];
  for (let f = 0; f < nf; f++) if (flipped(f)) bad.push(f);
  if (!bad.length) return body;

  const { start, next } = adjacency(runtime);
  const grow = (rings: number) => {
    for (let i = 0; i < rings; i++) {
      const add: number[] = [];
      for (let v = 0; v < V; v++)
        if (!zone[v])
          for (let e = start[v]!; e < start[v + 1]!; e++)
            if (zone[next[e]!]) {
              add.push(v);
              break;
            }
      for (const v of add) zone[v] = 1;
    }
  };
  const mark = (fs: number[]) => {
    for (const f of fs) for (let k = 0; k < 3; k++) zone[faces[f * 3 + k]!] = 1;
  };
  mark(bad);
  grow(2);
  const d = new Float64Array(V * 3);
  for (let i = 0; i < d.length; i++) d[i] = body[i]! - base[i]!;
  const sync = (members: number[]) => {
    for (const v of members)
      for (let k = 0; k < 3; k++) p[v * 3 + k] = base[v * 3 + k]! + d[v * 3 + k]!;
  };
  for (let i = 0; i < p.length; i++) p[i] = base[i]! + d[i]!;
  let members: number[] = [],
    checked: number[] = [];
  const refresh = () => {
    members = [];
    for (let v = 0; v < V; v++) if (zone[v]) members.push(v);
    checked = [];
    for (let f = 0; f < nf; f++)
      if (zone[faces[f * 3]!] || zone[faces[f * 3 + 1]!] || zone[faces[f * 3 + 2]!])
        checked.push(f);
  };
  refresh();
  const avg = new Float64Array(V * 3);
  for (let ring = 0; ring < maxRings; ring++) {
    for (let it = 0; it < maxIterations; it++) {
      if (ring > 0 || it >= maxIterations / 2)
        for (const v of members) for (let k = 0; k < 3; k++) d[v * 3 + k] *= 0.9;
      for (const v of members) {
        const a = start[v]!,
          b = start[v + 1]!,
          cnt = Math.max(b - a, 1);
        for (let k = 0; k < 3; k++) {
          let s = 0;
          for (let e = a; e < b; e++) s += d[next[e]! * 3 + k]!;
          avg[v * 3 + k] = s / cnt;
        }
      }
      for (const v of members)
        for (let k = 0; k < 3; k++) d[v * 3 + k] += 0.5 * (avg[v * 3 + k]! - d[v * 3 + k]!);
      sync(members);
      bad = checked.filter(flipped);
      if (!bad.length) break;
    }
    if (!bad.length) break;
    mark(bad);
    grow(1);
    refresh();
  }
  for (let i = 0; i < body.length; i++) body[i] = p[i]!;
  return body;
}

/** 근육 부분은 볼륨 0의 가중치로, 늘어난 가중치는 평활된 BK: 필드로 보낸다. */
function withBulk(zero: Map<string, number>, full: Map<string, number>) {
  const out = new Map(zero);
  for (const key of new Set([...zero.keys(), ...full.keys()])) {
    if (!key.includes("BODY_Muscle_") || !MUSCLE_PARTS.has(key.split(":", 1)[0]!)) continue;
    const d = (full.get(key) ?? 0) - (zero.get(key) ?? 0);
    if (d !== 0) out.set("BK:" + key, d);
  }
  return out;
}

/** standin_body.muscle_bulk_offset — body(Blender 휴지 공간, basis 포함)를 제자리에서 바꾼다. */
function bulkOffset(runtime: ShapeRuntime, c: BlenderControls, body: Float64Array) {
  const bulk = 0.75 * c.muscle_bulk! * (1 - 0.8 * smooth(0.4, 1.7, Math.max(0, c.physique!)));
  if (bulk === 0) return;
  const { basis } = runtime;
  const V = runtime.header.vertexCount;
  const off = new Float64Array(V * 3);
  const [index, mb] = table(runtime, "MB", MB_WIDTH);
  for (let j = 0; j < index.length; j++) {
    const v = index[j]!;
    const o = j * MB_WIDTH;
    const bx = body[v * 3]!,
      by = body[v * 3 + 1]!,
      bz = body[v * 3 + 2]!;
    const K = mb[o]!;
    let ox = K * bx - mb[o + 1]!,
      oy = K * by - mb[o + 2]!,
      oz = K * bz - mb[o + 3]!;
    const x0 = basis[v * 3]!;
    for (let s = o + 4; s <= o + 8; s += 4) {
      const k = mb[s]!;
      if (k === 0) continue;
      let dx = (bx - mb[s + 1]!) * k;
      // 허벅지 안쪽이 몸 가운데를 넘지 않게: 안쪽으로 가는 x만 줄인다.
      if (dx * x0 < 0) dx *= smooth(0.018, 0.065, Math.abs(x0));
      ox += dx;
      oy += (by - mb[s + 2]!) * k;
      oz += (bz - mb[s + 3]!) * k;
    }
    off[v * 3] = ox;
    off[v * 3 + 1] = oy;
    off[v * 3 + 2] = oz;
  }
  for (let v = 0; v < V; v++) {
    const ax = Math.abs(basis[v * 3]!),
      z = basis[v * 3 + 2]!;
    const torso = smooth(1.02, 1.23, z) * (1 - smooth(1.43, 1.5, z)) * (1 - smooth(0.14, 0.24, ax));
    if (torso === 0) continue;
    off[v * 3] += body[v * 3]! * 0.13 * torso;
    off[v * 3 + 1] += Math.max(body[v * 3 + 1]! - 0.025, 0) * 0.08 * torso;
  }
  laplacian(runtime, off, 6);
  for (let v = 0; v < V; v++) {
    const z = basis[v * 3 + 2]!;
    const k = bulk * (1 - smooth(1.43, 1.49, z)) * smooth(0.12, 0.2, z);
    if (k === 0) continue;
    body[v * 3] += k * off[v * 3]!;
    body[v * 3 + 1] += k * off[v * 3 + 1]!;
    body[v * 3 + 2] += k * off[v * 3 + 2]!;
  }
}

function table(runtime: ShapeRuntime, name: string, width: number) {
  const index = runtime.arrays.get(name + ".idx");
  const values = runtime.arrays.get(name + ".val");
  if (!(index instanceof Uint16Array) || !(values instanceof Float32Array))
    throw new Error("shape runtime: missing " + name);
  if (values.length !== index.length * width) throw new Error("shape runtime: bad " + name);
  const V = runtime.header.vertexCount;
  for (const i of index) if (i >= V) throw new Error("shape runtime: " + name + " index");
  return [index, values] as const;
}

/** 메시 이웃(면의 변) 목록. standin_body.laplacian_smooth와 같은 변 집합이다. */
const ADJACENCY = new WeakMap<ShapeRuntime, { start: Uint32Array; next: Uint32Array }>();
function adjacency(runtime: ShapeRuntime) {
  let a = ADJACENCY.get(runtime);
  if (a) return a;
  const V = runtime.header.vertexCount;
  const { faces } = runtime;
  const seen = new Set<number>();
  const pairs: number[] = [];
  for (let f = 0; f < faces.length; f += 3)
    for (let e = 0; e < 3; e++) {
      const p = faces[f + e]!,
        q = faces[f + ((e + 1) % 3)]!;
      const key = p < q ? p * 65536 + q : q * 65536 + p;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(p, q);
    }
  const start = new Uint32Array(V + 1);
  for (const v of pairs) start[v + 1]++;
  for (let v = 0; v < V; v++) start[v + 1] += start[v]!;
  const fill = start.slice(0, V);
  const next = new Uint32Array(pairs.length);
  for (let i = 0; i < pairs.length; i += 2) {
    const p = pairs[i]!,
      q = pairs[i + 1]!;
    next[fill[p]!++] = q;
    next[fill[q]!++] = p;
  }
  a = { start, next };
  ADJACENCY.set(runtime, a);
  return a;
}

/** standin_body.laplacian_smooth: d += 0.5·(이웃 평균 − d), 제자리. */
function laplacian(runtime: ShapeRuntime, d: Float64Array, iterations: number) {
  const { start, next } = adjacency(runtime);
  const V = runtime.header.vertexCount;
  const avg = new Float64Array(V * 3);
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < V; v++) {
      const a = start[v]!,
        b = start[v + 1]!;
      let sx = 0,
        sy = 0,
        sz = 0;
      for (let e = a; e < b; e++) {
        const u = next[e]! * 3;
        sx += d[u]!;
        sy += d[u + 1]!;
        sz += d[u + 2]!;
      }
      const n = Math.max(b - a, 1);
      avg[v * 3] = sx / n;
      avg[v * 3 + 1] = sy / n;
      avg[v * 3 + 2] = sz / n;
    }
    for (let i = 0; i < d.length; i++) d[i] += 0.5 * (avg[i]! - d[i]!);
  }
}
