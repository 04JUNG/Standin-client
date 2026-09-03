import type { TourAnchorId, TourStepId } from "@/shared/types/tour";

/**
 * 투어가 보는 앱 상태. 화면 내부 state를 스토어로 끌어올리지 않기 위해, 로딩·오류·저장완료
 * 같은 화면 하위 상태는 "그 화면에만 있는 앵커가 지금 떠 있는가"로 판정한다.
 */
export type TourContext = {
  pathname: string;
  /** 분석할 입력이 준비됐는가(업로드·캡처 어느 쪽이든 여기로 모인다). */
  hasDraft: boolean;
  hasAnchor(id: TourAnchorId): boolean;
  /** 앵커가 눌릴 수 있는 상태인가. disabled 버튼을 "누르세요"라고 하지 않기 위해 본다. */
  isAnchorEnabled(id: TourAnchorId): boolean;
};

export type TourStep = {
  id: TourStepId;
  /** 강조할 요소들. 여럿이면 하나로 묶어 강조한다. 비어 있으면 화면 가운데 카드. */
  anchors: readonly TourAnchorId[];
  title: string;
  body: string;
  /** 이 스텝을 지금 보여줄 수 있는 화면인가. */
  match(ctx: TourContext): boolean;
  /**
   * 사용자가 실제로 해야 하는 동작이 끝났는가. 이 술어가 있는 스텝은 '다음' 버튼이 없다.
   *
   * 클릭을 가로채지 않고 결과만 본다. 그래서 버튼을 누르든, 단축키를 쓰든, 파일을
   * 끌어다 놓든 똑같이 진행된다.
   */
  done?(ctx: TourContext): boolean;
  /** done이 있는 스텝에서 사용자가 할 일을 한 줄로. */
  action?: string;
  /** 투어를 여기서 끝내는 스텝(분석 실패 안내 등). */
  terminal?: boolean;
};

/**
 * 스텝이 끝났는지 판정한다.
 *
 * 설명 스텝은 '다음'을 눌렀는지(acknowledged), 동작 스텝은 **지금 이 순간의 화면 상태**로
 * 판정한다. 동작 스텝을 한 번 끝냈다고 기록해 두지 않는 것이 핵심이다 — 미리보기에서
 * '다시 선택'을 눌러 입력이 사라지면 그 스텝은 저절로 다시 할 일이 된다.
 */
export function isStepSettled(
  step: TourStep,
  ctx: TourContext,
  acknowledged: readonly TourStepId[],
): boolean {
  if (step.done) return step.done(ctx);
  return acknowledged.includes(step.id);
}

/**
 * 활성 스텝 = 아직 끝나지 않은 스텝 중 지금 화면에 해당하는 첫 스텝.
 *
 * 선형 인덱스를 두지 않는다. 캡처 취소, '다시 선택', 분석 실패 후 홈 복귀처럼 흐름을
 * 거슬러 올라가는 경우마다 복구 코드를 따로 쓰지 않기 위해서다 — 화면이 돌아오면
 * 그 화면의 스텝이 저절로 다시 활성이 된다.
 *
 * 해당하는 스텝이 없으면(설정 화면 등) null. 투어는 켜진 채로 아무것도 그리지 않는다.
 */
export function resolveActiveStep(
  steps: readonly TourStep[],
  ctx: TourContext,
  acknowledged: readonly TourStepId[],
): TourStep | null {
  return steps.find((step) => step.match(ctx) && !isStepSettled(step, ctx, acknowledged)) ?? null;
}

/** 진행 표시용 순번. 실패 안내 같은 곁가지 스텝은 세지 않는다. */
export function stepProgress(
  steps: readonly TourStep[],
  step: TourStep,
): { current: number; total: number } {
  const counted = steps.filter((s) => !s.terminal);
  const index = counted.findIndex((s) => s.id === step.id);
  return { current: index + 1, total: counted.length };
}

/** '이전'으로 되돌릴 설명 스텝. 동작 스텝은 되돌릴 수 없다(이미 한 일을 취소할 수 없다). */
export function previousAcknowledgedStep(
  steps: readonly TourStep[],
  step: TourStep,
  acknowledged: readonly TourStepId[],
): TourStep | null {
  const index = steps.findIndex((s) => s.id === step.id);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = steps[i];
    if (candidate.done || candidate.terminal) return null;
    if (acknowledged.includes(candidate.id)) return candidate;
  }
  return null;
}
