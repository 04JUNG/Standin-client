import type { ShapeControl } from "./contract";

/**
 * 전문가용 조절의 묶음. 서버는 key 목록만 주므로 key 이름으로 부위를 나눈다.
 * 모르는 key는 "기타"에 둔다 — 새 쉐이프키가 생겨도 빠지지 않고 보이게.
 */
export const SHAPE_GROUPS = [
  {
    id: "proportion",
    label: "비율·길이",
    keys: ["height", "heads", "torso_length", "arm_length", "leg_length", "leg_ratio"],
  },
  {
    id: "head",
    label: "머리·목",
    keys: ["head_scale", "head_width", "head_depth", "neck_width", "neck_length"],
  },
  {
    id: "upper",
    label: "상체",
    keys: [
      "shoulders",
      "chest_width",
      "chest_depth",
      "waist",
      "breast_size",
      "breast_projection",
      "breast_spacing",
      "breast_height",
      "breast_width",
    ],
  },
  { id: "lower", label: "하체", keys: ["pelvis", "glute", "thigh", "calf"] },
  {
    id: "muscle",
    label: "근육",
    keys: [
      "muscle",
      "muscle_bulk",
      "definition",
      "detail_chest",
      "detail_back",
      "detail_shoulder",
      "detail_upperarm",
      "detail_forearm",
      "detail_thigh",
      "detail_calf",
    ],
  },
  {
    id: "fat",
    label: "살",
    keys: ["physique", "fat_gain", "fat_distribution", "fat_torso", "fat_arms", "fat_legs"],
  },
] as const;

export type ShapeGroup = { id: string; label: string; controls: ShapeControl[] };

/** 컨트롤을 부위별로 나눈다. 빈 묶음은 빼고, 묶음 안의 순서는 서버가 준 순서를 지킨다. */
export function groupControls(controls: readonly ShapeControl[]): ShapeGroup[] {
  const groupOf = new Map<string, string>();
  for (const g of SHAPE_GROUPS) for (const k of g.keys) groupOf.set(k, g.id);
  const groups: ShapeGroup[] = SHAPE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    controls: [],
  }));
  const other: ShapeGroup = { id: "other", label: "기타", controls: [] };
  for (const c of controls) {
    const id = groupOf.get(c.key);
    (groups.find((g) => g.id === id) ?? other).controls.push(c);
  }
  return [...groups, other].filter((g) => g.controls.length > 0);
}
