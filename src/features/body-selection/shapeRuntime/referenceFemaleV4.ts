/** Pinned female v4 reference graph evaluation. Mirrors its immutable controller's
 * operation and adjacency order, including local face repair. Run in a worker for UI use.
 * Raw authored shapes, precomputed static anatomical fields and projection live in SSR2.
 */
import type { ReferenceHeader, ReferenceArrays, NumericArray } from "./referenceFormat";
import type { BlenderControls, Landmarks } from "./common";
const clip = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clip((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const regions = ["Chest", "Back", "Shoulder", "UpperArm", "ForeArm", "Thigh", "Calf"];
const gains = [0.55, 0.75, 0.8, 0.85, 0.65, 0.95, 0.65];
export function mappings(c: BlenderControls) {
  const out: Record<string, number> = {},
    slim = Math.max(0, -c.physique),
    fat = Math.max(0, c.physique);
  for (const r of ["Torso", "Arms", "Legs"]) {
    out["BODY_Slim_" + r] = slim;
    const f = clip(fat + c["fat_" + r.toLowerCase()], 0, 1.4);
    out["BODY_Fat_" + r] =
      f *
      (r === "Torso"
        ? 1 - 0.14 * Math.max(c.fat_distribution, 0)
        : r === "Legs"
          ? 1 + 0.14 * c.fat_distribution
          : 1);
  }
  out.BODY_Fat_Abdomen = fat * Math.max(0, -c.fat_distribution) * 0.45;
  regions.forEach((r, i) => {
    const t = Math.min(c.muscle, 2);
    out["BODY_Muscle_" + r] = clip(
      gains[i] * t * (1.05 - 0.2 * t) + c["detail_" + r.toLowerCase()],
      0,
      1.8,
    );
  });
  out.BODY_Definition =
    (0.5 * smooth(0.25, 2, c.muscle) + 0.7 * c.definition) / (1 + 2 * fat + 2 * c.fat_gain);
  out.BODY_WeightGain = c.fat_gain;
  out.BODY_AthleticVolume = Math.max(0, c.muscle - 2) / 2;
  out.BODY_AthleticDefinition = Math.max(0, c.muscle - 2) / 2 / (1 + fat + 1.5 * c.fat_gain);
  out.BODY_ProfileFat = c.fat_gain / 2;
  out.BODY_ProfileAthletic = Math.max(0, c.muscle - 2) / 2;
  for (const [key, name] of [
    ["chest_width", "ChestWidth"],
    ["chest_depth", "ChestDepth"],
    ["waist", "Waist"],
    ["glute", "Glute"],
    ["thigh", "Thigh"],
    ["calf", "Calf"],
    ["breast_projection", "BreastProjection"],
    ["breast_spacing", "BreastSpacing"],
    ["breast_height", "BreastHeight"],
    ["breast_width", "BreastWidth"],
  ])
    out["BODY_" + name] = c[key];
  out.BODY_BreastSmall = Math.max(0, -c.breast_size);
  out.BODY_BreastLarge = Math.max(0, c.breast_size);
  return out;
}
function interp(x: number, k: number[], v: number[]) {
  if (x <= k[0]) return v[0];
  for (let i = 1; i < k.length; i++)
    if (x < k[i]) return v[i - 1] + ((v[i] - v[i - 1]) / (k[i] - k[i - 1])) * (x - k[i - 1]);
  return v[v.length - 1];
}
function pchip(x: number, k: number[], v: number[]) {
  const h = k.slice(1).map((x, i) => x - k[i]),
    d = h.map((x, i) => (v[i + 1] - v[i]) / x),
    s = [d[0], 0, 0, 0, d[3]];
  for (let j = 1; j < 4; j++)
    if (d[j - 1] * d[j] > 0) {
      const w1 = 2 * h[j] + h[j - 1],
        w2 = h[j] + 2 * h[j - 1];
      s[j] = (w1 + w2) / (w1 / d[j - 1] + w2 / d[j]);
    }
  if (x < k[0]) return v[0] + x - k[0];
  if (x > k[4]) return v[4] + x - k[4];
  let i = 0;
  while (i < 3 && x >= k[i + 1]) i++;
  const t = clip((x - k[i]) / h[i], 0, 1);
  return (
    (2 * t ** 3 - 3 * t * t + 1) * v[i] +
    (t ** 3 - 2 * t * t + t) * h[i] * s[i] +
    (-2 * t ** 3 + 3 * t * t) * v[i + 1] +
    (t ** 3 - t * t) * h[i] * s[i + 1]
  );
}
export function warp(points: NumericArray, c: BlenderControls, lm: Landmarks) {
  const q = new Float64Array(points.length),
    { floor, top, chin, ankle, knee, hip, shoulder } = lm;
  const h = hip + 0.065 * c.leg_length,
    sh = h + (shoulder - hip) * (1 + 0.1 * c.torso_length),
    ch = sh + (chin - shoulder) + 0.015 * c.neck_length,
    hh = (ch - floor) / (c.heads - 1),
    nt = ch + hh;
  const kn = ankle + (h - ankle) * ((knee - ankle) / (hip - ankle) - 0.055 * c.leg_ratio),
    scale = c.height_cm / 100 / (nt - floor),
    hs = hh / (top - chin);
  const k = [floor, ankle, knee, hip, shoulder, chin, top],
    v = [floor, ankle, kn, h, sh, ch, nt],
    ck = k.slice(0, 5),
    cv = v.slice(0, 5);
  const curved = ["leg_length", "leg_ratio", "torso_length"].some((k) => Math.abs(c[k]) > 1e-9);
  // Keep the operation ordering of the pinned Python controller, including its second ch expression.
  const curveCh = sh + chin - shoulder + 0.015 * c.neck_length,
    curveNt = curveCh + (curveCh - floor) / (c.heads - 1);
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i],
      y = points[i + 1],
      z = points[i + 2],
      ax = Math.abs(x),
      sign = Math.sign(x);
    let qx = x,
      qy = y,
      qz = interp(z, k, v);
    if (z > top) qz = nt + ((z - top) * hh) / (top - chin);
    const upper = smooth(hip + 0.08, shoulder - 0.07, z) * (1 - smooth(shoulder + 0.06, chin, z));
    qx += sign * 0.022 * c.shoulders * smooth(0.025, 0.16, ax) * upper;
    const pelvis = (1 - smooth(hip + 0.02, hip + 0.15, z)) * smooth(0.02, 0.14, z);
    qx += sign * 0.013 * c.pelvis * smooth(0.015, 0.075, ax) * pelvis;
    qx += sign * clip(ax - 0.165, 0, 0.52) * 0.12 * c.arm_length * upper;
    const hf = smooth(chin - 0.035, chin + 0.015, z);
    qx *= 1 + hf * (hs ** 0.74 * (1 + 0.12 * c.head_width) - 1);
    qy += (y - lm.head_y) * hf * (hs ** 0.68 * (1 + 0.14 * c.head_depth) - 1);
    const neck =
      smooth(shoulder + 0.005, shoulder + 0.065, z) *
      (1 - smooth(chin - 0.05, chin - 0.005, z)) *
      (1 - smooth(0.055, 0.105, ax));
    qx *= 1 + 0.15 * c.neck_width * neck;
    qy += (y - lm.head_y) * 0.15 * c.neck_width * neck;
    qx *= scale;
    qy *= scale;
    qz *= scale;
    qz -= floor * scale;
    const f = (c.head_scale - 1) * smooth(chin - 0.06, chin - 0.005, z);
    qx += qx * f;
    qy += (qy - lm.head_y * scale) * f;
    qz += (qz - (ch - floor) * scale) * f;
    if (curved)
      qz +=
        ((pchip(z, ck, cv) - interp(z, ck, cv)) *
          smooth(floor, floor + 0.04, z) *
          (1 - smooth(shoulder - 0.075, shoulder, z)) *
          (c.height_cm / 100)) /
        (curveNt - floor);
    q[i] = qx;
    q[i + 1] = qy;
    q[i + 2] = qz;
  }
  return q;
}
const add = (a: NumericArray, b: NumericArray) => {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
};
const subtract = (a: NumericArray, b: NumericArray) => {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
};
function cap(a: Float64Array, max: number, epsilon: number) {
  for (let i = 0; i < a.length; i += 3) {
    const norm = Math.sqrt(a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2]),
      f = Math.min(1, max / Math.max(norm, epsilon));
    a[i] *= f;
    a[i + 1] *= f;
    a[i + 2] *= f;
  }
  return a;
}
export class ExactFemale {
  meta: ReferenceHeader;
  a: ReferenceArrays;
  N: number;
  foldStats: number[];
  constructor(meta: ReferenceHeader, arrays: ReferenceArrays) {
    this.meta = meta;
    this.a = arrays;
    this.N = meta.referenceVertices;
    this.foldStats = [];
  }
  average(d: NumericArray) {
    const { adjDst: dst, adjSrc: src, degree } = this.a,
      avg = new Float64Array(d.length);
    for (let e = 0; e < dst.length; e++) {
      const a = dst[e] * 3,
        b = src[e] * 3;
      avg[a] += d[b];
      avg[a + 1] += d[b + 1];
      avg[a + 2] += d[b + 2];
    }
    for (let j = 0; j < this.N; j++) {
      const i = j * 3;
      avg[i] /= degree[j];
      avg[i + 1] /= degree[j];
      avg[i + 2] /= degree[j];
    }
    return avg;
  }
  laplacian(d: NumericArray, iterations: number) {
    const result = new Float64Array(d);
    for (let it = 0; it < iterations; it++) {
      const avg = this.average(result);
      for (let i = 0; i < result.length; i++) result[i] += 0.5 * (avg[i] - result[i]);
    }
    return result;
  }
  crossFaces(d: NumericArray) {
    const F = this.a.referenceFaces,
      out = new Float64Array(F.length);
    for (let f = 0; f < F.length; f += 3) {
      const a = 3 * F[f],
        b = 3 * F[f + 1],
        c = 3 * F[f + 2],
        ux = d[b] - d[a],
        uy = d[b + 1] - d[a + 1],
        uz = d[b + 2] - d[a + 2],
        vx = d[c] - d[a],
        vy = d[c + 1] - d[a + 1],
        vz = d[c + 2] - d[a + 2];
      out[f] = uy * vz - uz * vy;
      out[f + 1] = uz * vx - ux * vz;
      out[f + 2] = ux * vy - uy * vx;
    }
    return out;
  }
  fold(
    base: NumericArray,
    body: NumericArray,
    maxIterations: number,
    maxRings: number,
  ): NumericArray {
    const ref = this.crossFaces(base),
      F = this.a.referenceFaces;
    const flipped = (co: NumericArray) => {
      const n = this.crossFaces(co),
        bad = [];
      for (let f = 0; f < n.length; f += 3)
        if (ref[f] * n[f] + ref[f + 1] * n[f + 1] + ref[f + 2] * n[f + 2] <= 0) bad.push(f);
      return bad;
    };
    let bad = flipped(body);
    if (!bad.length) {
      this.foldStats.push(0);
      return body;
    }
    this.foldStats.push(bad.length);
    let zone = new Uint8Array(this.N);
    const mark = () => {
      for (const f of bad) {
        zone[F[f]] = 1;
        zone[F[f + 1]] = 1;
        zone[F[f + 2]] = 1;
      }
    };
    const grow = () => {
      const next = zone.slice(),
        { adjDst: dst, adjSrc: src } = this.a;
      for (let e = 0; e < dst.length; e++) if (zone[src[e]]) next[dst[e]] = 1;
      zone = next;
    };
    mark();
    grow();
    grow();
    const d = subtract(body, base);
    for (let ring = 0; ring < maxRings; ring++) {
      for (let it = 0; it < maxIterations; it++) {
        if (ring > 0 || it >= Math.floor(maxIterations / 2))
          for (let j = 0; j < this.N; j++)
            if (zone[j]) {
              const i = j * 3;
              d[i] *= 0.9;
              d[i + 1] *= 0.9;
              d[i + 2] *= 0.9;
            }
        const avg = this.average(d);
        for (let j = 0; j < this.N; j++)
          if (zone[j]) {
            const i = j * 3;
            d[i] += 0.5 * (avg[i] - d[i]);
            d[i + 1] += 0.5 * (avg[i + 1] - d[i + 1]);
            d[i + 2] += 0.5 * (avg[i + 2] - d[i + 2]);
          }
        bad = flipped(add(base, d));
        if (!bad.length) break;
      }
      if (!bad.length) break;
      mark();
      grow();
    }
    return add(base, d);
  }
  anatomy(c: BlenderControls) {
    const { base } = this.a,
      w = mappings(c),
      body = new Float64Array(base);
    for (const name of this.meta.deltaNames) {
      const d = this.a["raw:" + name],
        weight = w[name];
      for (let i = 0; i < body.length; i++) body[i] += weight * d[i];
    }
    const reference = warp(base, c, this.meta.landmarks);
    const out = this.fold(reference, warp(body, c, this.meta.landmarks), 20, 3),
      offset = new Float64Array(base.length);
    for (const name of this.meta.offsetNames) {
      const weight = w[name];
      if (Math.abs(weight) > 1e-12) {
        const d = this.a["offset:" + name];
        for (let i = 0; i < offset.length; i++) offset[i] += weight * d[i];
      }
    }
    if (c.muscle > 2) {
      const gain = (c.muscle - 2) / 2;
      for (const { side } of this.meta.forearms) {
        const radial = this.a["forearmRadial:" + side],
          taper = this.a["forearmTaper:" + side],
          weight = this.a["forearmWeight:" + side];
        for (let j = 0; j < this.N; j++) {
          const f = 0.055 * gain * taper[j] * weight[j],
            i = j * 3;
          offset[i] += radial[i] * f;
          offset[i + 1] += radial[i + 1] * f;
          offset[i + 2] += radial[i + 2] * f;
        }
      }
    }
    let maximum = 0;
    for (const x of offset) maximum = Math.max(maximum, Math.abs(x));
    if (maximum < 1e-12) return { out, reference };
    const delta = cap(
      subtract(warp(add(base, offset), c, this.meta.landmarks), reference),
      0.012,
      1e-15,
    );
    let candidate = this.fold(out, add(out, delta), 30, 6);
    const fat = Math.max(0, c.physique) + 0.4 * c.fat_gain;
    if (fat > 0.6) {
      const displacement = subtract(candidate, reference),
        sm = this.laplacian(displacement, 8),
        vn = this.a.normals;
      let den = 0,
        num = 0;
      for (let i = 0; i < sm.length; i++) {
        den += sm[i] * vn[i];
        num += displacement[i] * vn[i];
      }
      if (Math.abs(den) > 1e-8 && num * den > 0) {
        const f = clip(num / den, 0.95, 1.05);
        for (let i = 0; i < sm.length; i++) sm[i] *= f;
      }
      const amount = 0.42 * smooth(0.6, 1.7, fat),
        extra = new Float64Array(base.length),
        mask = this.a.fatProtect;
      for (let j = 0; j < this.N; j++) {
        const f = amount * mask[j],
          i = j * 3;
        for (let k = 0; k < 3; k++) extra[i + k] = (sm[i + k] - displacement[i + k]) * f;
      }
      cap(extra, 0.003, 1e-15);
      candidate = this.fold(candidate, add(candidate, extra), 30, 6);
    }
    candidate = this.fold(reference, candidate, 30, 6);
    return { out: candidate, reference };
  }
  compute(c: BlenderControls) {
    this.foldStats = [];
    const { reference, out: initial } = this.anatomy(c);
    let out = initial;
    if (c.muscle > 2 + 1e-10) {
      const high = out,
        low = this.anatomy({ ...c, muscle: 2 }).out,
        added = subtract(high, low),
        sm = this.laplacian(added, 28),
        move = new Float64Array(out.length),
        support = new Float64Array(this.N);
      for (let n = 0; n < this.meta.limbs.length; n++) {
        const limb = this.meta.limbs[n],
          ends = warp(new Float64Array([...limb.head, ...limb.tail]), c, this.meta.landmarks),
          axis = [ends[3] - ends[0], ends[4] - ends[1], ends[5] - ends[2]],
          len = Math.max(Math.sqrt(axis.reduce((s, x) => s + x * x, 0)), 1e-12);
        for (let k = 0; k < 3; k++) axis[k] /= len;
        const mask = this.a["limbMask:" + n];
        for (let j = 0; j < this.N; j++) {
          const i = j * 3,
            dot = added[i] * axis[0] + added[i + 1] * axis[1] + added[i + 2] * axis[2],
            sdot = sm[i] * axis[0] + sm[i + 1] * axis[1] + sm[i + 2] * axis[2];
          for (let k = 0; k < 3; k++) {
            const radial = added[i + k] - dot * axis[k],
              sr = sm[i + k] - sdot * axis[k],
              correction = -limb.amount * radial + 0.65 * (1 - limb.amount) * (sr - radial);
            move[i + k] += correction * mask[j];
          }
          support[j] += mask[j];
        }
      }
      const pin = this.a.pin;
      for (let j = 0; j < this.N; j++) {
        const i = j * 3;
        for (let k = 0; k < 3; k++)
          move[i + k] = pin[j] ? 0 : move[i + k] / Math.max(support[j], 1);
      }
      cap(move, 0.022 * (c.height_cm / 175), 1e-12);
      const candidate = add(high, move),
        gain = (c.muscle - 2) / 2,
        elbow = new Float64Array(this.N);
      for (const { side, head } of this.meta.forearms) {
        const center = warp(new Float64Array(head), c, this.meta.landmarks),
          own = this.a["armOwn:" + side];
        for (let j = 0; j < this.N; j++) {
          const i = j * 3,
            dx = reference[i] - center[0],
            dy = reference[i + 1] - center[1],
            dz = reference[i + 2] - center[2],
            distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          elbow[j] = Math.max(
            elbow[j],
            Math.exp(-((distance / ((0.075 * c.height_cm) / 175)) ** 4)) * smooth(0.2, 0.8, own[j]),
          );
        }
      }
      const sleeve = subtract(this.laplacian(candidate, 16), candidate);
      for (let j = 0; j < this.N; j++) {
        const f = pin[j] ? 0 : 0.5 * gain * elbow[j],
          i = j * 3;
        for (let k = 0; k < 3; k++) sleeve[i + k] *= f;
      }
      cap(sleeve, (0.003 * c.height_cm) / 175, 1e-12);
      out = this.fold(reference, add(candidate, sleeve), 30, 6);
    }
    const activation = smooth(1.25, 2, c.muscle);
    if (activation >= 1e-12) {
      const gain = clip((c.muscle - 2) / 2, 0, 1),
        amount = (0.004 + 0.008 * gain) * activation * (c.height_cm / 175),
        candidate = new Float64Array(out),
        base = this.a.base,
        mask = this.a.pelvisMask;
      for (let j = 0; j < this.N; j++)
        candidate[j * 3] += -Math.sign(base[j * 3]) * amount * mask[j];
      out = this.fold(reference, candidate, 30, 6);
    }
    return out;
  }
  preview(c: BlenderControls) {
    const result = this.compute(c),
      ids = this.a.previewIndices,
      w = this.a.previewWeights,
      out = new Float64Array(this.meta.vertexCount * 3);
    for (let j = 0; j < this.meta.vertexCount; j++)
      for (let k = 0; k < 3; k++) {
        const i = j * 3;
        out[i + k] =
          w[i] * result[ids[i] * 3 + k] +
          w[i + 1] * result[ids[i + 1] * 3 + k] +
          w[i + 2] * result[ids[i + 2] * 3 + k];
      }
    return out;
  }
}
