import { useMemo } from "react";
import type { PoseCandidate } from "../api/pose.contract";
import { useAnalysisResult } from "./useAnalysisResult";
import { useRefineSelection } from "./useRefineSelection";

export type ReviewItem = {
  personIndex: number;
  candidate: PoseCandidate;
  /** 저장과 미리보기가 함께 쓰는 최종 다운로드 경로. */
  exportUrl: string | undefined;
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
          refined: currentOutcome?.refined === true,
          skipped: !currentOutcome,
        },
      ];
    });
  }, [data, selectedByPerson, refineByPerson]);

  return {
    ...analysis,
    items,
    /** refine 호출이 아직 도는 중이면 미리보기 URL이 바뀔 수 있다. */
    isRefining: status === "running",
  };
}
