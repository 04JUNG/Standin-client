import { describe, expect, it } from "vitest";
import { parseShapeRuntime, SHAPE_RUNTIME_FORMAT } from "./format";
import { accumulate } from "./common";
import { adjacency } from "./mesh";

function largeRuntime(
  options: { indexDtype?: string; invalidIndex?: boolean; nan?: boolean } = {},
) {
  const n = 70000;
  const parts = [
    ["basis", "float32", new Float32Array(n * 3)],
    ["faces", "uint32", new Uint32Array([1, 65539, 0, 2, 3, 0])],
    ["band", "uint32", new Uint32Array(0)],
    ["bandConst", "float32", new Float32Array(0)],
    ["F.idx:D:test", "uint32", new Uint32Array([options.invalidIndex ? n : 65539])],
    ["F.val:D:test", "float32", new Float32Array([options.nan ? NaN : 0.01234567, 0, 0])],
    ["G.val:D:test", "int16", new Int16Array(0)],
  ] as const;
  let offset = 0;
  const arrays = parts.map(([name, dtype, data]) => {
    const row = { name, dtype, offset, length: data.length };
    offset += data.byteLength;
    return row;
  });
  const header = {
    format: SHAPE_RUNTIME_FORMAT,
    rules: "test-large",
    asset: "test",
    indexDtype: options.indexDtype ?? "uint32",
    vertexCount: n,
    faceCount: 2,
    bandCount: 0,
    landmarks: {
      floor: 0,
      ankle: 0.1,
      knee: 0.5,
      hip: 1,
      shoulder: 1.4,
      chin: 1.5,
      top: 1.7,
      head_y: 0,
    },
    baseHeads: 8,
    controls: {},
    aliases: {},
    presets: {},
    constants: { gains: {} },
    fields: [{ name: "D:test", scale: 1, bandScale: 1, count: 1, valueDtype: "float32" }],
    arrays,
  };
  const raw = new TextEncoder().encode(JSON.stringify(header));
  const size = Math.ceil(raw.length / 4) * 4;
  const buffer = new ArrayBuffer(8 + size + offset);
  const view = new DataView(buffer);
  view.setUint32(0, 0x31525353, true);
  view.setUint32(4, size, true);
  new Uint8Array(buffer, 8, size).fill(32);
  new Uint8Array(buffer, 8, raw.length).set(raw);
  parts.forEach(([, , data], i) =>
    new Uint8Array(buffer, 8 + size + arrays[i]!.offset, data.byteLength).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    ),
  );
  return buffer;
}

describe("full-resolution rule runtime indices", () => {
  it("retains vertices above 65535 and distinct edges that collide under a 16-bit key", () => {
    const runtime = parseShapeRuntime(largeRuntime());
    if (runtime.kind !== "rules") throw new Error("expected rule runtime");
    expect(runtime.faces).toBeInstanceOf(Uint32Array);
    const { start, next } = adjacency(runtime);
    expect([...next.slice(start[1], start[2])]).toContain(65539);
    expect([...next.slice(start[2], start[3])]).toContain(3);
    const out = new Float64Array(70000 * 3);
    accumulate(runtime, new Map([["D:test", 1]]), out);
    expect(out[65539 * 3]).toBeCloseTo(0.01234567, 8);
    expect(out[3 * 3]).toBe(0);
  });

  it("rejects a large mesh with 16-bit indices", () => {
    expect(() => parseShapeRuntime(largeRuntime({ indexDtype: "uint16" }))).toThrow(
      "requires uint32",
    );
  });

  it("rejects out-of-range indices and nonfinite displacement fields", () => {
    expect(() => parseShapeRuntime(largeRuntime({ invalidIndex: true }))).toThrow("field index");
    expect(() => parseShapeRuntime(largeRuntime({ nan: true }))).toThrow("nonfinite field");
  });
});
