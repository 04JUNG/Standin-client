/** Narrow static mesh contract. Reject active/external glTF resources before loading. */
export type CandidateModel = { url: string; rotation: number[][]; sourceSha: string };
export function validRotation(value: unknown): value is number[][] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 3 ||
        row.some((x) => typeof x !== "number" || !Number.isFinite(x)),
    )
  )
    return false;
  const m = value as number[][];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      if (Math.abs(m[i]!.reduce((sum, x, k) => sum + x * m[j]![k]!, 0) - (i === j ? 1 : 0)) > 1e-6)
        return false;
    }
  const [a, b, c] = m as [number[], number[], number[]];
  const det =
    a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
    a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
    a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
  return Math.abs(det - 1) < 1e-6;
}
export function validateModel(
  data: ArrayBuffer,
  sourceSha: string | undefined,
  characterId: string,
  scope = "full",
  version = "posed-mesh-v1",
) {
  if (data.byteLength < 28 || data.byteLength > 8 * 1024 * 1024) throw new Error("model size");
  const v = new DataView(data);
  if (
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== data.byteLength ||
    v.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("model header");
  const jsonSize = v.getUint32(12, true);
  if (jsonSize > 128 * 1024 || jsonSize + 28 > data.byteLength) throw new Error("model JSON size");
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonSize)));
  const meta = doc.asset?.extras;
  if (
    meta?.version !== version ||
    (sourceSha !== undefined && meta.source_bvh_sha256 !== sourceSha) ||
    !/^[a-f0-9]{64}$/.test(meta.source_bvh_sha256) ||
    meta.character_id !== characterId ||
    meta.coordinates !== "Y-up-hips-origin" ||
    meta.scope !== scope ||
    (version === "framed-mesh-v1" &&
      meta.camera_rotation !== null &&
      !validRotation(meta.camera_rotation))
  )
    throw new Error("model lineage");
  // This format has exactly one static mesh and one internal buffer. No network,
  // animation, skeleton or extensions can alter the verified posed surface.
  if (
    doc.extensionsUsed?.length ||
    doc.extensionsRequired?.length ||
    doc.images?.length ||
    doc.textures?.length ||
    doc.animations?.length ||
    doc.skins?.length ||
    doc.nodes?.length !== 1 ||
    doc.meshes?.length !== 1 ||
    doc.buffers?.length !== 1 ||
    doc.buffers[0].uri !== undefined ||
    Object.keys(doc.nodes[0]).some((k) => k !== "mesh") ||
    doc.nodes[0].mesh !== 0
  )
    throw new Error("unsupported model resources");
  const primitives = doc.meshes[0].primitives;
  if (primitives?.length !== 1 || primitives[0].targets || primitives[0].extensions)
    throw new Error("unsupported mesh");
  for (const accessor of doc.accessors ?? []) {
    if (
      !Number.isInteger(accessor.count) ||
      accessor.count < 1 ||
      accessor.count > 500_000 ||
      accessor.sparse
    )
      throw new Error("model geometry limit");
  }
  return meta;
}
