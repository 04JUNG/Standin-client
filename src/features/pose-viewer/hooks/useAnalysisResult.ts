import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { ApiError } from "@/shared/api/errors";
import { poseService } from "../api/pose.service";
import { AnalysisError } from "../api/pose.contract";
import { poseQueryKeys } from "../queryKeys";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { currentSurface, trackEvent } from "@/features/analytics/analyticsClient";

/**
 * 분석 결과 조회와 선택 상태 파생(docs/03 §7).
 *
 * 앱 모드(PoseViewerPage)와 바 모드(BarCandidatesPage)가 같은 로직을 쓰고 뷰만 다르다.
 * 한 컴포넌트가 화면 전체 로직을 소유하지 않게 하는 원칙(CLAUDE.md §10)에도 맞는다.
 */

/**
 * 이미 보낸 `results_viewed`의 job+표면. 훅 안의 ref로 두면 마운트마다 초기화돼
 * 앱↔바를 오갈 때마다 같은 결과가 다시 집계된다. 모듈 스코프여야 한 번만 남는다.
 */
let lastViewedKey: string | null = null;
/** `analysis_failed`도 같은 이유로 마운트가 아니라 job 단위로 한 번만 남긴다. */
let lastFailedKey: string | null = null;

/**
 * 사용량 제한으로 거절된 코드들. 서버가 주는 코드를 그대로 지표에 실어 쿼터 초과와
 * 실제 장애를 구분한다 — 전부 REJECTED로 뭉개면 "베타 참여자가 한도에 자주 막히는가"를
 * 알 수 없다.
 */
const LIMIT_CODES = new Set([
  "DAILY_QUOTA_EXCEEDED",
  "GLOBAL_QUOTA_EXCEEDED",
  "CONCURRENCY_LIMIT",
  "RATE_LIMITED",
  "SERVICE_PAUSED",
  "PAYLOAD_TOO_LARGE",
]);

/** 실패 사유를 지표용 코드로 분류한다. 사용자 문구는 화면이 따로 고른다(docs/06 §4). */
function failureReason(err: unknown): string {
  if (err instanceof AnalysisError) return err.code;
  if (err instanceof ApiError) {
    if (LIMIT_CODES.has(err.code)) return err.code;
    return err.status >= 500 ? "SERVER_ERROR" : "REJECTED";
  }
  if (typeof err === "object" && err !== null && "kind" in err && err.kind === "network") {
    return "NETWORK";
  }
  return "UNKNOWN";
}

export function useAnalysisResult(jobId: string | undefined) {
  // 분석 시작 시각. 실패까지 사용자가 실제로 기다린 시간을 재려면 클라에만 있는 값이다.
  const startedAt = useRef<number | null>(null);
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
    // queryFn이 단순 GET이 아니라 분석 Job을 생성한다. 후보→확인 화면 재마운트나
    // 네트워크 재연결이 같은 입력의 Job을 다시 만들지 않도록 route job당 한 번만 실행한다.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // hard fallback(자동 후보 없음)인 인물은 선택 대상이 아니라 안내로만 보여준다.
  // soft fallback은 다르다 — 저신뢰지만 후보가 있으므로 계속 고르고 저장할 수 있다.
  const people = useMemo(() => query.data?.people ?? [], [query.data?.people]);
  const selectablePeople = people.filter((p) => p.fallbackMode !== "hard");
  const failedPeople = people.filter((p) => p.fallbackMode === "hard");
  const selectedCount = selectablePeople.filter((p) => selectedByPerson[p.index]).length;
  const allSelected = selectablePeople.length > 0 && selectedCount === selectablePeople.length;

  useEffect(() => {
    if (query.isFetching && startedAt.current === null) startedAt.current = Date.now();
  }, [query.isFetching]);

  // 분석 실패는 서버 job status에도 남지만, 사용자가 얼마나 기다리다 무엇을 봤는지는
  // 클라에만 있다. 서버 jobId를 아직 모르므로 job에 연결하지 않고 설치 단위로만 남긴다.
  useEffect(() => {
    if (!query.isError || !jobId) return;
    if (lastFailedKey === jobId) return;
    lastFailedKey = jobId;
    trackEvent("analysis_failed", {
      reason: failureReason(query.error),
      surface: currentSurface(),
      elapsedMs: startedAt.current ? Date.now() - startedAt.current : 0,
    });
  }, [query.isError, query.error, jobId]);

  useEffect(() => {
    if (!query.data) return;
    const surface = currentSurface();
    const viewKey = `${query.data.jobId}:${surface}`;
    if (lastViewedKey === viewKey) return;
    lastViewedKey = viewKey;
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
    const previousCandidateId = selectedByPerson[personIndex] ?? null;
    // 이미 고른 후보를 다시 눌러도 "후보 변경"으로 세면 변경 횟수 지표가 부풀려진다.
    if (previousCandidateId === candidateId) return;

    const candidate = people
      .find((person) => person.index === personIndex)
      ?.candidates.find((item) => item.id === candidateId);
    trackEvent(
      "candidate_selected",
      {
        personIndex,
        candidateId,
        previousCandidateId,
        rank: candidate?.rank ?? 0,
        surface: currentSurface(),
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
