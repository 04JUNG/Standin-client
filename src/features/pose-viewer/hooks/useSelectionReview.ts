import { useQueries } from "@tanstack/react-query";
import { useExportStore } from "@/features/export/store/exportStore";
import { candidateThumbnailOptions } from "../api/candidateThumbnail";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
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
   * 조정 결과는 해당 결과의 그림만 쓴다. 원본 결과만 후보 썸네일을 쓸 수 있다.
   * FBX 확인은 useFramedReview가 최종 모델 또는 범위별 PNG로 대체한다.
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
  const characterId = usePoseSelectionStore((s) => s.characterId);
  const byPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const { status, refineByPerson } = useRefineSelection(analysis.data);
  const { data, selectedByPerson } = analysis;
  const format = useExportStore((s) => s.format);
  const framed =
    format === "fbx" && data?.capabilities.fbxExport && data.capabilities.outputScopeCropping;

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
          // A deferred refined preview must never show the unmodified pose.
          previewUrl:
            currentOutcome?.previewUrl || (currentOutcome?.refined ? "" : candidate.thumbnailUrl),
          refined: currentOutcome?.refined === true,
          skipped: !currentOutcome,
        },
      ];
    });
  }, [data, selectedByPerson, refineByPerson]);

  const previews = useQueries({
    queries: items.map((item) => ({
      ...candidateThumbnailOptions(
        item.candidate.deferredThumbnailUrl,
        item.candidate.previewModel,
        byPerson[item.personIndex] ?? characterId ?? undefined,
      ),
      enabled:
        !analysis.bodies.enabled &&
        !framed &&
        !item.refined &&
        !!item.candidate.deferredThumbnailUrl &&
        !item.previewUrl,
    })),
  });
  return {
    ...analysis,
    items: items.map((item, i) => ({
      ...item,
      previewUrl: item.previewUrl || previews[i]?.data || "",
    })),
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
