import { z } from "zod";

/**
 * `standin-shape-runtime.v1` (.ssr): Blender 체형 컨트롤러의 중립 체형 계산을 앱에서 다시 하기 위한 자산.
 *
 *   "SSR1" | u32 headerBytes | header JSON (UTF-8, 공백으로 4바이트 정렬) | data
 *
 * data에는 기준 메시(basis, faces)와 체형 필드가 들어 있다. 무거운 평활화는 굽는 쪽
 * (scripts/shape-runtime)에서 끝났고, 앱은 필드의 가중합과 정점별 닫힌 식만 계산한다.
 * 형식과 크기를 모두 검사한다 — 검사를 통과하지 못한 자산은 그리지 않는다.
 */
export const SHAPE_RUNTIME_FORMAT = "standin-shape-runtime.v1";
const MAGIC = 0x31525353; // "SSR1" little-endian
const MAX_VERTICES = 65535; // faces/indices are u16

const finite = z.number().finite();
const arraySchema = z.object({
  name: z.string().min(1),
  dtype: z.enum(["float32", "uint16", "int16"]),
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
});
const headerSchema = z.object({
  format: z.literal(SHAPE_RUNTIME_FORMAT),
  rules: z.string().min(1),
  asset: z.string().min(1),
  vertexCount: z.number().int().positive().max(MAX_VERTICES),
  faceCount: z.number().int().nonnegative(),
  bandCount: z.number().int().nonnegative(),
  landmarks: z
    .object({
      floor: finite,
      ankle: finite,
      knee: finite,
      hip: finite,
      shoulder: finite,
      chin: finite,
      top: finite,
      head_y: finite,
    })
    .passthrough(),
  baseHeads: finite,
  controls: z.record(z.object({ min: finite, max: finite, default: finite })),
  aliases: z.record(z.string()),
  presets: z.record(z.record(finite)),
  /** 규칙마다 다른 상수. 각 규칙의 계산 모듈이 필요한 값을 다시 검사한다. */
  constants: z.object({ gains: z.record(finite) }).catchall(z.union([finite, z.record(finite)])),
  fields: z.array(
    z.object({
      name: z.string().min(1),
      scale: finite.positive(),
      bandScale: finite.positive(),
      count: z.number().int().nonnegative(),
    }),
  ),
  arrays: z.array(arraySchema),
});
export type ShapeRuntimeHeader = z.infer<typeof headerSchema>;

export type ShapeField = {
  name: string;
  /** 0이 아닌 정점 번호와 xyz 값(int16 × scale). */
  index: Uint16Array;
  values: Int16Array;
  scale: number;
  /** 지방 연결 띠(band) 정점의 36회 평활 차이(int16 × bandScale). */
  band: Int16Array;
  bandScale: number;
};
export type ShapeRuntime = {
  header: ShapeRuntimeHeader;
  basis: Float32Array;
  faces: Uint16Array;
  band: Uint16Array;
  bandConst: Float32Array;
  fields: Map<string, ShapeField>;
  /** 규칙별 추가 표(예: 0.6.10 근육 볼륨 `MB.idx`/`MB.val`). 각 규칙 모듈이 길이를 다시 검사한다. */
  arrays: ReadonlyMap<string, Float32Array | Uint16Array | Int16Array>;
};

const TYPED = { float32: Float32Array, uint16: Uint16Array, int16: Int16Array } as const;

export function parseShapeRuntime(buffer: ArrayBuffer): ShapeRuntime {
  if (buffer.byteLength < 8) throw new Error("shape runtime: too short");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("shape runtime: bad magic");
  const headerBytes = view.getUint32(4, true);
  if (headerBytes % 4 !== 0 || 8 + headerBytes > buffer.byteLength)
    throw new Error("shape runtime: bad header size");
  const header = headerSchema.parse(
    JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerBytes))),
  );
  const dataStart = 8 + headerBytes;
  const arrays = new Map<string, Float32Array | Uint16Array | Int16Array>();
  for (const a of header.arrays) {
    const Type = TYPED[a.dtype];
    const start = dataStart + a.offset;
    if (start % Type.BYTES_PER_ELEMENT !== 0)
      throw new Error("shape runtime: misaligned " + a.name);
    if (start + a.length * Type.BYTES_PER_ELEMENT > buffer.byteLength)
      throw new Error("shape runtime: out of bounds " + a.name);
    if (arrays.has(a.name)) throw new Error("shape runtime: duplicate " + a.name);
    arrays.set(a.name, new Type(buffer, start, a.length));
  }
  const take = <T extends Float32Array | Uint16Array | Int16Array>(
    name: string,
    Type: { new (...args: never[]): T },
    length: number,
  ): T => {
    const a = arrays.get(name);
    if (!(a instanceof Type) || a.length !== length) throw new Error("shape runtime: bad " + name);
    return a;
  };
  const V = header.vertexCount;
  const basis = take("basis", Float32Array, V * 3);
  const faces = take("faces", Uint16Array, header.faceCount * 3);
  const band = take("band", Uint16Array, header.bandCount);
  const bandConst = take("bandConst", Float32Array, header.bandCount * 3);
  for (const i of faces) if (i >= V) throw new Error("shape runtime: face index");
  for (const i of band) if (i >= V) throw new Error("shape runtime: band index");
  for (const v of basis) if (!Number.isFinite(v)) throw new Error("shape runtime: basis");
  const fields = new Map<string, ShapeField>();
  for (const f of header.fields) {
    const index = take("F.idx:" + f.name, Uint16Array, f.count);
    for (const i of index) if (i >= V) throw new Error("shape runtime: field index " + f.name);
    fields.set(f.name, {
      name: f.name,
      index,
      values: take("F.val:" + f.name, Int16Array, f.count * 3),
      scale: f.scale,
      band: take("G.val:" + f.name, Int16Array, header.bandCount * 3),
      bandScale: f.bandScale,
    });
  }
  return { header, basis, faces, band, bandConst, fields, arrays };
}
