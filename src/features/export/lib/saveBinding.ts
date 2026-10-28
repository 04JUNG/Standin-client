import type { QueryClient } from "@tanstack/react-query";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";

/** Consent is bound to the same owner, job, selection, body and hand inputs as export. */
export function saveConsentBinding(qc: QueryClient, routeJob: string | undefined) {
  const state = usePoseSelectionStore.getState();
  const owner = useInstallationStore.getState().credentials?.installationId ?? "";
  const result = qc.getQueryData<AnalysisResult>(poseQueryKeys.result(routeJob ?? ""));
  return JSON.stringify({
    routeJob,
    owner,
    result,
    job: state.jobId,
    selected: state.selectedByPerson,
    excluded: state.excludedPeople,
    character: state.characterId,
    characters: state.characterByPerson,
    refine: state.refineByPerson,
    body: qc.getQueriesData({
      queryKey: ["body", owner, result?.jobId ?? ""],
      predicate: (q) => q.queryKey[4] === "selection",
    }),
    hands: qc.getQueriesData({
      queryKey: ["hands", owner, result?.jobId ?? ""],
      predicate: (q) => q.queryKey.length === 4,
    }),
  });
}
