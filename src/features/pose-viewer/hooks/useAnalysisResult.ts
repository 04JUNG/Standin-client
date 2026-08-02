import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { poseService } from "../api/pose.service";
import { poseQueryKeys } from "../queryKeys";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { trackEvent } from "@/features/analytics/analyticsClient";

/**
 * 분석 결과 조회와 선택 상태 파생(docs/03 §7).
 *
 * 앱 모드(PoseViewerPage)와 바 모드(BarCandidatesPage)가 같은 로직을 쓰고 뷰만 다르다.
 * 한 컴포넌트가 화면 전체 로직을 소유하지 않게 하는 원칙(CLAUDE.md §10)에도 맞는다.
 */
export function useAnalysisResult(jobId: string | undefined) {
  const lastViewed = useRef<string | null>(null);
  const draft = useUploadStore((s) => s.draft);
  const selectedByPerson = usePoseSelectionStore((s) => s.selectedByPerson);
  const selectCandidate = usePoseSelectionStore((s) => s.selectCandidate);
  const setServerJobId = usePoseSelectionStore((s) => s.setServerJobId);

  const sourceFile = draft?.file ?? null;

  const query = useQuery({
    queryKey: poseQueryKeys.result(jobId ?? ""),
    queryFn: () =>
      poseService.analyze({
        jobId: jobId ?? "",
        file: sourceFile!,
        source: draft!.source,
        width: draft!.width,
        height: draft!.height,
      }),
    enabled: Boolean(jobId && sourceFile),
  });

  // 후보를 하나도 못 찾은 인물은 선택 대상이 아니라 "검색 실패"로만 보여준다.
  const people = useMemo(() => query.data?.people ?? [], [query.data?.people]);
  const selectablePeople = people.filter((p) => p.candidates.length > 0);
  const failedPeople = people.filter((p) => p.candidates.length === 0);
  const selectedCount = selectablePeople.filter((p) => selectedByPerson[p.index]).length;
  const allSelected = selectablePeople.length > 0 && selectedCount === selectablePeople.length;

  useEffect(() => {
    if (!query.data) return;
    const surface = window.location.pathname.startsWith("/bar") ? "bar" : "app";
    const viewKey = `${query.data.jobId}:${surface}`;
    if (lastViewed.current === viewKey) return;
    lastViewed.current = viewKey;
    setServerJobId(query.data.jobId);
    trackEvent(
      "results_viewed",
      {
        surface,
        peopleCount: people.length,
        candidateCount: people.reduce((sum, person) => sum + person.candidates.length, 0),
      },
      query.data.jobId,
    );
  }, [query.data, people, setServerJobId]);

  function selectAndTrack(personIndex: number, candidateId: string) {
    const candidate = people
      .find((person) => person.index === personIndex)
      ?.candidates.find((item) => item.id === candidateId);
    trackEvent(
      "candidate_selected",
      {
        personIndex,
        candidateId,
        previousCandidateId: selectedByPerson[personIndex] ?? null,
        rank: candidate?.rank ?? 0,
        surface: window.location.pathname.startsWith("/bar") ? "bar" : "app",
      },
      query.data?.jobId,
    );
    selectCandidate(personIndex, candidateId);
  }

  return {
    ...query,
    draft,
    sourceFile,
    people,
    selectablePeople,
    failedPeople,
    selectedByPerson,
    selectedCount,
    allSelected,
    selectCandidate: selectAndTrack,
  };
}
