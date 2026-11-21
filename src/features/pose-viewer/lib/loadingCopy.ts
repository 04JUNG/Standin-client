import type { AnalysisSnapshot } from "../api/analysisProgress";

const SHOT_LABELS = { full_half: "전신·반신", bust: "상반신 컷", face: "얼굴 클로즈업" };
const VIEW_LABELS = { front: "정면", side: "측면", back: "뒷모습", three_quarter: "3/4 시점" };

/** Never derives cut metadata from a partial people array or the focused body. */
export function observedSceneFacts(scene?: AnalysisSnapshot["scene"]) {
  return [
    ...(scene?.shot
      ? [{ id: `shot:${scene.shot}`, category: "컷", label: SHOT_LABELS[scene.shot] }]
      : []),
    ...(scene?.view
      ? [{ id: `view:${scene.view}`, category: "시점", label: VIEW_LABELS[scene.view] }]
      : []),
    ...(scene?.personCount !== undefined
      ? [{ id: `count:${scene.personCount}`, category: "인물", label: `${scene.personCount}명` }]
      : []),
  ];
}

export const SEARCH_MODE_COPY = {
  pose: "자세가 비슷한 포즈를 찾고 있어요",
  description: "동작의 특징을 살펴보고 있어요",
  combined: "자세와 동작을 함께 비교하고 있어요",
  upper_body: "보이는 상체를 중심으로 비교하고 있어요",
};
export const REFINE_COPY = {
  running: "러프에 맞춰 조정하고 있어요",
  improved: "자세를 러프에 맞췄어요",
  unchanged: "원래 포즈를 유지해요",
  reverted: "비교 후 원래 포즈를 유지해요",
  skipped: "이 후보는 원래 자세로 준비해요",
};

export const REFINE_DETAIL = {
  running: "조정 결과가 준비되면 변화를 보여드려요.",
  improved: "조정 전후의 자세를 비교해요.",
  unchanged: "비교 결과에 따라 원래 후보를 준비해요.",
  reverted: "조정안을 비교한 뒤 원래 후보를 준비해요.",
  skipped: "이 후보는 조정 없이 준비해요.",
};
