import { useQuery } from "@tanstack/react-query";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { poseService } from "../api/pose.service";
import { poseQueryKeys } from "../queryKeys";
import { usePoseSelectionStore } from "../store/poseSelectionStore";

/**
 * 분석 결과 조회와 선택 상태 파생(docs/03 §7).
 *
 * 앱 모드(PoseViewerPage)와 바 모드(BarCandidatesPage)가 같은 로직을 쓰고 뷰만 다르다.
 * 한 컴포넌트가 화면 전체 로직을 소유하지 않게 하는 원칙(CLAUDE.md §10)에도 맞는다.
 */
export function useAnalysisResult(jobId: string | undefined) {
  const draft = useUploadStore((s) => s.draft);
  const selectedByPerson = usePoseSelectionStore((s) => s.selectedByPerson);
  const selectCandidate = usePoseSelectionStore((s) => s.selectCandidate);

  const sourceFile = draft?.file ?? null;

  const query = useQuery({
    queryKey: poseQueryKeys.result(jobId ?? ""),
    queryFn: () => poseService.analyze({ jobId: jobId ?? "", file: sourceFile! }),
    enabled: Boolean(jobId && sourceFile),
  });

  // 후보를 하나도 못 찾은 인물은 선택 대상이 아니라 "검색 실패"로만 보여준다.
  const people = query.data?.people ?? [];
  const selectablePeople = people.filter((p) => p.candidates.length > 0);
  const failedPeople = people.filter((p) => p.candidates.length === 0);
  const selectedCount = selectablePeople.filter((p) => selectedByPerson[p.index]).length;
  const allSelected = selectablePeople.length > 0 && selectedCount === selectablePeople.length;

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
    selectCandidate,
  };
}
