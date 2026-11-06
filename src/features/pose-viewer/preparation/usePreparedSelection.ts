import { ApiError } from "@/shared/api/errors";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import type { AnalysisResult } from "../api/pose.contract";
import type { CandidatePreparation } from "./useCandidatePreparation";
import { reusePreparedSelection } from "./reuse";
export function usePreparedSelection(
  result: AnalysisResult | undefined,
  preparation: CandidatePreparation | undefined,
  picks: Record<number, string>,
) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const binding = JSON.stringify([owner, preparation?.binding, preparation?.batch?.batchId, picks]);
  const query = useQuery({
    queryKey: ["prepared-selection", owner, result?.jobId, binding],
    enabled:
      preparation?.enabled &&
      preparation?.ready &&
      !!preparation?.batch &&
      Object.keys(picks).length > 0,
    queryFn: async ({ signal }) => ({
      binding,
      outcomes: await reusePreparedSelection(result!, preparation!.batch!, picks, signal),
    }),
    staleTime: Infinity,
    gcTime: 600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const outcomes = query.data?.binding === binding ? query.data.outcomes : undefined;
  useEffect(() => {
    if (!outcomes || useInstallationStore.getState().credentials?.installationId !== owner) return;
    for (const outcome of Object.values(outcomes))
      usePoseSelectionStore.getState().setRefineOutcome(outcome);
  }, [outcomes, owner]);
  return {
    ready: !!outcomes && query.isSuccess && !query.isFetching && preparation?.ready,
    outcomes: outcomes ?? {},
    error:
      query.error ??
      (preparation?.enabled && preparation.failed
        ? new ApiError(409, "PREPARATION_EXPIRED", "")
        : null),
    retry: () => query.refetch(),
  };
}
