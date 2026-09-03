import { useMemo } from "react";
import type { PoseCandidate } from "../api/pose.contract";
import { useAnalysisResult } from "./useAnalysisResult";
import { useRefineSelection } from "./useRefineSelection";

export type ReviewItem = {
  personIndex: number;
  candidate: PoseCandidate;
  /** 저장과 미리보기가 함께 쓰는 최종 다운로드 경로. */
  exportUrl: string | undefined;
  /**
   * 저장될 포즈의 미리보기 이미지.
   *
   * 조정 결과의 그림이 있으면 그것이고, 없으면 사용자가 고른 후보 썸네일이다. 둘 다
   * 서버가 **같은 렌더러**로 그린 그림이라 나란히 놓아도 시각 언어가 갈리지 않는다.
   * 비어 있을 수도 있다 — 그때 화면은 자리표시자를 그린다.
   */
  previewUrl: string;
  /** 조정본이 만들어졌는가. false면 베이스 포즈가 그대로 저장된다. */
  refined: boolean;
  /** refine을 아예 시도하지 않은 선택(저신뢰 인물, 기능 off 등). */
  skipped: boolean;
};

/**
 * 저장 직전 확인 화면의 데이터(ADR-010).
 *
 * 앱 모드(ReviewPage)와 바 모드(BarReviewPage)가 이 훅을 공유한다 — 어디서 확인했는지에
 * 따라 저장되는 파일이 달라지면 안 된다.
 */
export function useSelectionReview(jobId: string | undefined) {
  const analysis = useAnalysisResult(jobId);
  const { status, refineByPerson } = useRefineSelection(analysis.data);
  const { data, selectedByPerson } = analysis;

  const items = useMemo((): ReviewItem[] => {
    if (!data) return [];
    return Object.entries(selectedByPerson).flatMap(([key, candidateId]) => {
      const personIndex = Number(key);
      const candidate = data.people
        .find((p) => p.index === personIndex)
        ?.candidates.find((c) => c.id === candidateId);
      if (!candidate) return [];
      const outcome = refineByPerson[personIndex];
      const currentOutcome =
        outcome?.jobId === data.jobId && outcome.candidateId === candidateId ? outcome : undefined;
      return [
        {
          personIndex,
          candidate,
          // 조정 결과가 있으면 그 URL이 최종이다. 없으면 후보의 베이스 URL로 저장한다.
          exportUrl: currentOutcome?.exportUrl ?? candidate.bvhUrl,
          // 조정본 그림이 없을 때 후보 썸네일을 쓰는 것은 "비슷한 그림"이 아니다.
          // 그 경우 저장되는 것이 실제로 그 후보의 베이스 포즈다.
          previewUrl: currentOutcome?.previewUrl || candidate.thumbnailUrl,
          refined: currentOutcome?.refined === true,
          skipped: !currentOutcome,
        },
      ];
    });
  }, [data, selectedByPerson, refineByPerson]);

  return {
    ...analysis,
    items,
    /**
     * 조정이 끝나지 않았다 — 저장 대상 URL이 아직 바뀔 수 있다.
     *
     * `running`이 아니라 `!== "done"`으로 본다. 마운트 직후 한 프레임 동안 status는
     * `idle`인데, 그걸 "끝남"으로 다루면 첫 렌더가 완료 화면을 보여주고 저장 버튼도
     * 활성이 된다 — 그 사이에 저장하면 조정본 대신 베이스 URL이 내려간다.
     */
    isRefining: status !== "done",
  };
}
