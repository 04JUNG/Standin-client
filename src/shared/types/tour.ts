/**
 * 투어가 강조할 요소의 id와 스텝 id(docs/03 §1 사용자 흐름).
 *
 * shared/에 두는 이유: 앵커를 AppShell·DropZone 같은 shared 컴포넌트에도 붙여야 하는데
 * shared는 features를 import할 수 없다(CLAUDE.md §8). shortcuts가 타입은
 * shared/types에, 레지스트리는 shared/lib에 두는 것과 같은 구조다.
 */

export const TOUR_ANCHOR_IDS = [
  "shell.sidebar",
  "home.dropzone",
  "home.capture",
  "preview.analyze",
  "jobs.pending",
  "jobs.error",
  "jobs.candidates",
  "jobs.confirm",
  "review.confirm",
  "save.error",
  "save.files",
  "save.newScene",
] as const;

export type TourAnchorId = (typeof TOUR_ANCHOR_IDS)[number];

export const TOUR_STEP_IDS = [
  "welcome",
  "sidebar",
  "upload",
  "capture",
  "input",
  "analyze",
  "waiting",
  "failed",
  "choose",
  "confirm",
  "review",
  "savefailed",
  "saved",
  "finish",
] as const;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];
