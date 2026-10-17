import type { ShapeControl } from "./contract";

/**
 * 체형 조절 값의 화면 이름. 서버는 key만 준다(`body-shape.v1`). 모르는 key는 그대로 보인다.
 * key는 Blender 컨트롤러(standin_body.py)의 축 이름을 따른다.
 */
const LABELS: Record<string, string> = {
  height: "키",
  heads: "등신",
  physique: "체격",
  muscle: "근육",
  muscle_bulk: "근육 볼륨",
  shoulders: "어깨",
  definition: "근육 선명도",
  head_scale: "머리 크기",
  head_width: "머리 폭",
  head_depth: "머리 깊이",
  neck_width: "목 굵기",
  neck_length: "목 길이",
  chest_width: "가슴 폭",
  chest_depth: "가슴 두께",
  waist: "허리",
  pelvis: "골반",
  glute: "엉덩이",
  thigh: "허벅지",
  calf: "종아리",
  torso_length: "상체 길이",
  arm_length: "팔 길이",
  leg_length: "다리 길이",
  leg_ratio: "다리 비율",
  detail_chest: "가슴 근육",
  detail_back: "등 근육",
  detail_shoulder: "어깨 근육",
  detail_upperarm: "위팔 근육",
  detail_forearm: "아래팔 근육",
  detail_thigh: "허벅지 근육",
  detail_calf: "종아리 근육",
  fat_torso: "몸통 살",
  fat_arms: "팔 살",
  fat_legs: "다리 살",
};

export const shapeLabel = (key: string) => LABELS[key] ?? key;

export function formatShapeValue(control: ShapeControl, value: number) {
  if (control.key === "height") return `${Math.round(value)}cm`;
  const digits = control.step >= 1 ? 0 : control.step >= 0.1 ? 1 : 2;
  return value.toFixed(digits);
}
