/** Actual approved default human mesh. Reference skinning never authorizes final output. */
export const HUMAN_TEMPLATE_VERSION = "default-body-template-v1";
export const HUMAN_REFERENCE_METHOD = "reference-skinning-v1";
export const DEFAULT_HUMAN_SHA = "7c648b97a24a3bb4914b6e5d515708c33727979881d92ef916d5726e22301f3d";
export type HumanScope = "full" | "half" | "bust" | "shoulder_head" | "head";
export type HumanTemplate = {
  version: typeof HUMAN_TEMPLATE_VERSION;
  scope: HumanScope;
  character_id: "standin-master-v2";
  character_sha256: string;
  pose_method: typeof HUMAN_REFERENCE_METHOD;
  preview_only: true;
  coordinates: "Y-up";
  influences: 8;
  joints: { role: string; parent: number; head: number[]; tail: number[] }[];
  profiles: Record<string, Record<string, string>>;
  meshes: {
    positions: number[];
    normals: number[];
    skinIndices: number[];
    skinWeights: number[];
    triangles: number[];
  }[];
};
export const humanScopes: HumanScope[] = ["full", "half", "bust", "shoulder_head", "head"];
export function parseHumanTemplate(raw: unknown, scope: HumanScope): HumanTemplate {
  const fail = (): never => {
    throw Error("기본 인체 참고 자산을 확인하지 못했습니다.");
  };
  if (!raw || typeof raw !== "object") return fail();
  const t = raw as HumanTemplate;
  if (
    t.version !== HUMAN_TEMPLATE_VERSION ||
    t.scope !== scope ||
    t.character_id !== "standin-master-v2" ||
    t.character_sha256 !== DEFAULT_HUMAN_SHA ||
    t.coordinates !== "Y-up" ||
    t.pose_method !== HUMAN_REFERENCE_METHOD ||
    t.preview_only !== true ||
    t.influences !== 8 ||
    !Array.isArray(t.joints) ||
    t.joints.length < 14 ||
    t.joints.length > 40 ||
    !Array.isArray(t.meshes) ||
    !t.meshes.length ||
    t.meshes.length > 8
  )
    return fail();
  const finite = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x));
  const roles = new Set<string>();
  for (const [i, j] of t.joints.entries()) {
    if (
      !j ||
      typeof j.role !== "string" ||
      j.role.length > 40 ||
      roles.has(j.role) ||
      !Number.isInteger(j.parent) ||
      j.parent < -1 ||
      j.parent >= i ||
      !finite(j.head) ||
      j.head.length !== 3 ||
      !finite(j.tail) ||
      j.tail.length !== 3
    )
      return fail();
    roles.add(j.role);
  }
  if (
    !roles.has("hips") ||
    !t.profiles ||
    typeof t.profiles !== "object" ||
    Object.keys(t.profiles).length > 8
  )
    return fail();
  for (const p of Object.values(t.profiles)) {
    if (
      !p ||
      typeof p !== "object" ||
      Object.keys(p).length > 50 ||
      Object.values(p).some((v) => typeof v !== "string" || v.length > 128)
    )
      return fail();
  }
  let total = 0;
  for (const m of t.meshes) {
    if (
      !m ||
      !finite(m.positions) ||
      m.positions.length % 3 ||
      !m.positions.length ||
      !finite(m.normals) ||
      m.normals.length !== m.positions.length
    )
      return fail();
    const n = m.positions.length / 3;
    total += n;
    if (
      total > 100_000 ||
      !finite(m.skinIndices) ||
      m.skinIndices.length !== n * 8 ||
      m.skinIndices.some((v) => !Number.isInteger(v) || v < 0 || v >= t.joints.length) ||
      !finite(m.skinWeights) ||
      m.skinWeights.length !== n * 8 ||
      m.skinWeights.some((v) => v < 0 || v > 1) ||
      !finite(m.triangles) ||
      m.triangles.length % 3 ||
      m.triangles.length > 600_000 ||
      m.triangles.some((v) => !Number.isInteger(v) || v < 0 || v >= n)
    )
      return fail();
    for (let i = 0; i < n; i++)
      if (Math.abs(m.skinWeights.slice(i * 8, i * 8 + 8).reduce((a, b) => a + b, 0) - 1) > 0.001)
        return fail();
  }
  return t;
}
