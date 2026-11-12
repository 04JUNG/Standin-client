/** Test-only helpers for binary v2 solved states (docs: Standin-server INTERACTIVE_STATE_BINARY_V2). */
import { webcrypto } from "node:crypto";
import type { PoseModel } from "../solved";

export function stateBytes(fixture: { stateBase64: string }) {
  // Plain, 8-byte aligned Uint8Array (a pooled Buffer view could be unaligned).
  return new Uint8Array(Buffer.from(fixture.stateBase64, "base64"));
}
export async function sha256(bytes: Uint8Array) {
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
// Python json.dumps(sort_keys=True, ensure_ascii=True, separators=(",", ":")).
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => canonical(k) + ":" + canonical((value as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value).replace(
    /[\u0080-￿]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
const align = (n: number) => (n + 7) & ~7;
function readSection(bytes: Uint8Array, offset: number) {
  const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset + 8, true);
  const text = new TextDecoder().decode(bytes.subarray(offset + 12, offset + 12 + size));
  return { header: JSON.parse(text) as Record<string, unknown>, end: align(offset + 12 + size) };
}
function writeSection(magic: string, header: unknown) {
  const text = canonical(header);
  const out = new Uint8Array(align(12 + text.length));
  out.set(new TextEncoder().encode(magic), 0);
  new DataView(out.buffer).setUint32(8, text.length, true);
  out.set(new TextEncoder().encode(text), 12);
  return out;
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
/** Typed-JSON headers (floats as `$f64`) and the raw numeric body after the model header. */
export function splitState(bytes: Uint8Array) {
  const state = readSection(bytes, 0);
  const model = readSection(bytes, state.end);
  return {
    stateHeader: state.header,
    modelHeader: model.header,
    modelOffset: state.end,
    bodyOffset: model.end,
    body: bytes.slice(model.end),
  };
}
export function joinState(stateHeader: unknown, modelHeader: unknown, body: Uint8Array) {
  return concat([
    writeSection("STNDSPS2", stateHeader),
    writeSection("STNDMDL2", modelHeader),
    body,
  ]);
}
export function f64(value: number) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return {
    $f64: [...new Uint8Array(view.buffer)].map((x) => x.toString(16).padStart(2, "0")).join(""),
  };
}
function padded(array: Float64Array | Uint32Array | Uint16Array) {
  const raw = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const out = new Uint8Array(align(raw.length));
  out.set(raw);
  return out;
}
/** Independent test encoder of a v1-shaped model into the v2 model container (header + body). */
export function encodeModel(model: PoseModel) {
  const bones = new Float64Array(model.bones.length * 48);
  model.bones.forEach((b, i) => {
    bones.set(b.restLocal, i * 48);
    bones.set(b.poseLocal, i * 48 + 16);
    bones.set(b.inverseBind, i * 48 + 32);
  });
  const sections = [padded(bones)];
  const meshes = model.meshes.map((m) => {
    const counts = m.weights.map((w) => w.length);
    const offsets = new Uint32Array(counts.length + 1);
    counts.forEach((c, i) => (offsets[i + 1] = offsets[i] + c));
    sections.push(
      padded(new Float64Array(m.positions.flat())),
      padded(new Float64Array(m.normals.flat())),
      padded(new Uint32Array(m.triangles.flat())),
      padded(new Uint32Array(m.normalTriangles.flat())),
      padded(offsets),
      padded(new Uint16Array(m.weights.flat().map(([bone]) => bone))),
      padded(new Float64Array(m.weights.flat().map(([, weight]) => weight))),
    );
    return {
      name: m.name,
      vertices: m.positions.length,
      normals: m.normals.length,
      triangles: m.triangles.length,
      influences: offsets[counts.length],
    };
  });
  const header = {
    schema: model.schema,
    coordinates: { ...model.coordinates, originBlender: model.coordinates.originBlender.map(f64) },
    capabilities: model.capabilities,
    bones: model.bones.map((b) => ({ name: b.name, parent: b.parent })),
    meshes,
  };
  return { header, body: concat(sections) };
}
