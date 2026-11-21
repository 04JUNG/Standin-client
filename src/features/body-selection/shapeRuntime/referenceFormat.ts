import { Unzlib } from "fflate";
import { z } from "zod";

/** Explicit SSR2 codec for one immutable reference controller. Older readers reject
 * this header; publishing the matching client is a prerequisite to activation. */
export const REFERENCE_ENCODING = "female-reference-v4-zlib";
export const REFERENCE_RULES = "standin-lod-female-hands-body-250um-ref-v4-final";
const finite = z.number().finite();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const vec3 = z.tuple([finite, finite, finite]);
const landmarks = z.object({
  floor: finite,
  ankle: finite,
  knee: finite,
  hip: finite,
  shoulder: finite,
  chin: finite,
  top: finite,
  head_y: finite,
});
const schema = z
  .object({
    format: z.literal("standin-shape-runtime.v2"),
    encoding: z.literal(REFERENCE_ENCODING),
    dataVersion: z.literal(1),
    asset: z.literal("female-v4-exact-reference"),
    rules: z.literal(REFERENCE_RULES),
    source: z
      .object({
        blendSha256: z.literal("aa10276a7c63a2b0f2336b6f4569e0fb541c6f2aa2dcf689ab96ec04573159d3"),
        controllerSha256: z.literal(
          "3a3ccd4e1fe09967b86dde7823aad9d0886d47b86b47021a3fcea58e61145052",
        ),
      })
      .strict(),
    sourceReferenceGraphSha256: z.literal(
      "dd3f65712e8c394619b7e6374b682d2a2e297ce15b0992e5c91f92fbe32705bb",
    ),
    referenceVertices: z.literal(105430),
    referenceFaces: z.literal(210856),
    vertexCount: z.literal(50000),
    faceCount: z.literal(99996),
    controls: z.record(z.object({ min: finite, max: finite, default: finite }).strict()),
    presets: z.record(z.record(finite)),
    aliases: z.record(z.string()),
    landmarks,
    deltaNames: z.array(z.string()).length(32),
    offsetNames: z.array(z.string()).max(32),
    limbs: z
      .array(z.object({ name: z.string(), amount: finite, head: vec3, tail: vec3 }).strict())
      .length(6),
    forearms: z.array(z.object({ side: z.enum(["Left", "Right"]), head: vec3 }).strict()).length(2),
    arrays: z.record(
      z
        .object({
          dtype: z.enum(["<f8", "<u4", "<u2", "|u1"]),
          shape: z.array(z.number().int().positive()).min(1).max(2),
          offset: z.number().int().nonnegative(),
          bytes: z.number().int().positive(),
        })
        .strict(),
    ),
    rawBytes: z
      .number()
      .int()
      .positive()
      .max(192 * 1024 * 1024),
    rawSha256: sha,
  })
  .strict();
export type ReferenceHeader = z.infer<typeof schema>;
export type NumericArray = Float64Array | Uint32Array | Uint16Array | Uint8Array;
export type ReferenceArrays = Record<string, NumericArray>;
export type ReferenceRuntime = {
  kind: "reference";
  header: ReferenceHeader;
  faces: Uint16Array;
  compressed: Uint8Array;
};
const TYPED = { "<f8": Float64Array, "<u4": Uint32Array, "<u2": Uint16Array, "|u1": Uint8Array };
const DELTAS = [
  "Slim_Torso",
  "Fat_Torso",
  "Slim_Arms",
  "Fat_Arms",
  "Slim_Legs",
  "Fat_Legs",
  "Fat_Abdomen",
  "Muscle_Chest",
  "Muscle_Back",
  "Muscle_Shoulder",
  "Muscle_UpperArm",
  "Muscle_ForeArm",
  "Muscle_Thigh",
  "Muscle_Calf",
  "Definition",
  "WeightGain",
  "AthleticVolume",
  "AthleticDefinition",
  "ProfileFat",
  "ProfileAthletic",
  "ChestWidth",
  "ChestDepth",
  "Waist",
  "Glute",
  "Thigh",
  "Calf",
  "BreastProjection",
  "BreastSpacing",
  "BreastHeight",
  "BreastWidth",
  "BreastSmall",
  "BreastLarge",
].map((x) => "BODY_" + x);
const CONTROL_KEYS =
  "height_cm heads head_scale head_width head_depth neck_width neck_length physique fat_gain muscle definition shoulders chest_width chest_depth waist pelvis glute thigh calf torso_length arm_length leg_length leg_ratio breast_size breast_projection breast_spacing breast_height breast_width fat_distribution detail_chest detail_back detail_shoulder detail_upperarm detail_forearm detail_thigh detail_calf fat_torso fat_arms fat_legs".split(
    " ",
  );
const PRESETS =
  "BASE SLIM IDEAL83 IDEAL70 TOON64 MUSCULAR MUSCLE_MAX SOFT FAT_MAX NEW_FAT NEW_MUSCULAR".split(
    " ",
  );
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
function fail(reason: string): never {
  throw new Error("shape reference: " + reason);
}
export function parseReferenceHeader(value: unknown): ReferenceHeader {
  const h = schema.parse(value);
  if (
    !sameSet(Object.keys(h.controls), CONTROL_KEYS) ||
    !sameSet(Object.keys(h.presets), PRESETS) ||
    h.deltaNames.join() !== DELTAS.join() ||
    !sameSet(h.offsetNames, [...new Set(h.offsetNames)]) ||
    h.offsetNames.some((x) => !DELTAS.includes(x))
  )
    fail("coverage");
  for (const [key, b] of Object.entries(h.controls))
    if (!(b.min < b.max && b.default >= b.min && b.default <= b.max) || !CONTROL_KEYS.includes(key))
      fail("control domain");
  for (const p of Object.values(h.presets)) {
    if (!sameSet(Object.keys(p), CONTROL_KEYS)) fail("preset fields");
    for (const [k, v] of Object.entries(p))
      if (v < h.controls[k].min || v > h.controls[k].max) fail("preset domain");
  }
  if (Object.values(h.aliases).some((x) => !CONTROL_KEYS.includes(x))) fail("alias");
  const lm = h.landmarks,
    ordered = [lm.floor, lm.ankle, lm.knee, lm.hip, lm.shoulder, lm.chin, lm.top];
  if (ordered.some((x, i) => i > 0 && x <= ordered[i - 1])) fail("landmarks");
  if (
    h.forearms[0].side !== "Left" ||
    h.forearms[1].side !== "Right" ||
    h.limbs.some(
      (l, i) =>
        l.amount !== [0.48, 0.44, 0.4, 0.48, 0.44, 0.4][i] ||
        l.head.every((x, k) => x === l.tail[k]),
    )
  )
    fail("limbs");
  return h;
}
/** Feed bounded compressed chunks so a forged stream cannot allocate its claimed
 * uncompressed size before the output limit has been checked. */
export function inflateReference(h: ReferenceHeader, compressed: Uint8Array): Uint8Array {
  if (compressed.byteLength === 0 || compressed.byteLength > 32 * 1024 * 1024)
    fail("compressed size");
  const out = new Uint8Array(h.rawBytes);
  let offset = 0,
    finished = false;
  const stream = new Unzlib((chunk, final) => {
    if (chunk.length > 2 * 1024 * 1024 || offset + chunk.length > out.length) fail("inflated size");
    out.set(chunk, offset);
    offset += chunk.length;
    finished = final;
  });
  for (let p = 0; p < compressed.length; p += 1024)
    stream.push(compressed.subarray(p, p + 1024), p + 1024 >= compressed.length);
  if (!finished || offset !== out.length) fail("inflated length");
  return out;
}
export function decodeReferenceArrays(h: ReferenceHeader, raw: Uint8Array): ReferenceArrays {
  if (raw.length !== h.rawBytes || raw.byteOffset % 8) fail("raw size/alignment");
  const N = h.referenceVertices,
    F = h.referenceFaces,
    V = h.vertexCount,
    expected: Record<string, [string, number[]]> = {
      base: ["<f8", [N, 3]],
      referenceFaces: ["<u4", [F, 3]],
      adjDst: ["<u4", [F * 3]],
      adjSrc: ["<u4", [F * 3]],
      degree: ["<f8", [N]],
      normals: ["<f8", [N, 3]],
      fatProtect: ["<f8", [N]],
      pin: ["|u1", [N]],
      pelvisMask: ["<f8", [N]],
      previewIndices: ["<u4", [V, 3]],
      previewWeights: ["<f8", [V, 3]],
      faces: ["<u2", [h.faceCount, 3]],
    };
  for (const name of h.deltaNames) expected["raw:" + name] = ["<f8", [N, 3]];
  for (const name of h.offsetNames) expected["offset:" + name] = ["<f8", [N, 3]];
  for (let i = 0; i < 6; i++) expected["limbMask:" + i] = ["<f8", [N]];
  for (const { side } of h.forearms) {
    expected["forearmRadial:" + side] = ["<f8", [N, 3]];
    for (const key of ["forearmTaper:", "forearmWeight:", "armOwn:"])
      expected[key + side] = ["<f8", [N]];
  }
  if (!sameSet(Object.keys(h.arrays), Object.keys(expected))) fail("array coverage");
  const arrays: ReferenceArrays = Object.create(null);
  let end = 0;
  for (const [name, s] of Object.entries(h.arrays).sort((a, b) => a[1].offset - b[1].offset)) {
    const [dtype, shape] = expected[name],
      Type = TYPED[s.dtype],
      bytes = shape.reduce((n, x) => n * x, 1) * Type.BYTES_PER_ELEMENT;
    // A closed triangular reference graph has 3*F directed edges. Keep source edge order.
    if (
      s.dtype !== dtype ||
      s.shape.join() !== shape.join() ||
      s.bytes !== bytes ||
      s.offset % Type.BYTES_PER_ELEMENT ||
      s.offset < end ||
      s.offset - end > 7 ||
      s.offset + bytes > raw.length
    )
      fail("array layout " + name);
    arrays[name] = new Type(
      raw.buffer as ArrayBuffer,
      raw.byteOffset + s.offset,
      bytes / Type.BYTES_PER_ELEMENT,
    );
    end = s.offset + bytes;
    if (s.dtype === "<f8")
      for (const x of arrays[name]) if (!Number.isFinite(x)) fail("nonfinite " + name);
  }
  if (end !== raw.length) fail("trailing data");
  for (const name of ["referenceFaces", "adjDst", "adjSrc", "previewIndices"])
    for (const i of arrays[name]) if (i >= N) fail("reference index");
  for (const i of arrays.faces) if (i >= V) fail("face index");
  const degree = new Uint32Array(N);
  for (const i of arrays.adjDst) degree[i]++;
  for (let i = 0; i < N; i++)
    if (arrays.degree[i] !== Math.max(degree[i], 1) || arrays.pin[i] > 1)
      fail("adjacency degree/pin");
  for (const name of [
    "fatProtect",
    "pelvisMask",
    ...h.limbs.map((_, i) => "limbMask:" + i),
    ...h.forearms.flatMap((x) => ["forearmTaper:" + x.side, "forearmWeight:" + x.side]),
  ])
    for (const x of arrays[name]) if (x < 0 || x > 1) fail("mask range");
  for (let i = 0; i < V; i++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      const w = arrays.previewWeights[i * 3 + k];
      if (w < -0.001 || w > 1.001) fail("projection weight");
      sum += w;
    }
    if (Math.abs(sum - 1) > 1e-5) fail("projection sum");
  }
  return arrays;
}
export function parseReferenceRuntime(value: unknown, compressed: Uint8Array): ReferenceRuntime {
  const header = parseReferenceHeader(value),
    arrays = decodeReferenceArrays(header, inflateReference(header, compressed));
  // Own a small index copy; do not retain 167MiB of decoded data in the UI cache.
  const faces = new Uint16Array(arrays.faces);
  return { kind: "reference", header, faces, compressed: compressed.slice() };
}
