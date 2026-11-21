import { canUseInteractiveOperations } from "@/features/pose-viewer/interactive/capability";
import { transientPollError } from "@/features/pose-viewer/interactive/pollRecovery";
import { applyLocalHands } from "@/features/pose-viewer/interactive/hands";
import { replayObservation } from "@/shared/lib/replayBridge";
import { featureAction, failureProperties } from "@/features/analytics/featureJourney";
import { invalidateFinalReview } from "@/features/export/lib/invalidateFinalReview";
import {
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useBodyOwner } from "@/features/body-selection/hooks";
import { ApiError } from "@/shared/api/client";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { getHandCatalog, getHandSelection, putHandSelection, handKeys } from "./api";
import type { HandSelection } from "./contract";
import { previewScope, scopeIncludesHands } from "@/features/pose-viewer/api/outputScope";

/**
 * A busy BFF/Converter answers hand reads with 429/5xx or not at all. Those reads are
 * retried with backoff, and a read that still fails keeps retrying every 15 s, so the page
 * recovers without a click. Library changes and disabled hands are never retried.
 */
const transientRetry = (failureCount: number, error: unknown) =>
  failureCount < 3 && transientPollError(error);
const retryDelay = (attempt: number) => Math.min(8_000, 1_000 * 2 ** attempt);
const healInterval = (query: { state: { status: string; error: unknown } }) =>
  query.state.status === "error" && transientPollError(query.state.error) ? 15_000 : false;
/** A failed re-read of a server answer we already hold is not a new failure. */
const visibleError = (query: { data?: unknown; error: unknown }) =>
  query.error && !(query.data !== undefined && transientPollError(query.error))
    ? query.error
    : null;

export function useHands(result: AnalysisResult | undefined, people: number[], enabled: boolean) {
  const owner = useBodyOwner(),
    qc = useQueryClient(),
    job = result?.jobId ?? "";
  const applicablePeople = people.filter((index) =>
    scopeIncludesHands(previewScope(result?.people?.find((p) => p.index === index))),
  );
  const active =
    enabled && result?.capabilities.handSelection === true && applicablePeople.length > 0;
  const catalog = useQuery({
    queryKey: handKeys.catalog(owner),
    queryFn: ({ signal }) => getHandCatalog(signal),
    enabled: active && !!owner,
    retry: transientRetry,
    retryDelay,
    refetchInterval: healInterval,
    refetchIntervalInBackground: true,
    staleTime: 300_000,
  });
  const queries = useQueries({
    queries: (active ? applicablePeople : []).map((person) => ({
      queryKey: handKeys.selection(owner, job, person),
      queryFn: ({ signal }: { signal: AbortSignal }) => getHandSelection(job, person, signal),
      enabled: active && !!owner && !!job,
      retry: transientRetry,
      retryDelay,
      refetchInterval: healInterval,
      refetchIntervalInBackground: true,
      staleTime: 0,
    })),
  });
  const mutation = useMutation({
    mutationKey: ["hand-change", owner, job],
    mutationFn: ({
      selection,
      patch,
    }: {
      selection: HandSelection;
      patch: { left?: string; right?: string };
    }) => {
      if (!active || !applicablePeople.includes(selection.personIndex))
        throw new Error("이 출력 범위에는 손이 포함되지 않습니다.");
      return putHandSelection(job, selection, patch);
    },
    onMutate: async ({ selection, patch }) => {
      invalidateFinalReview(qc, job, true);
      if (canUseInteractiveOperations(result?.capabilities))
        applyLocalHands(
          owner,
          job,
          selection.personIndex,
          patch.left ?? selection.left,
          patch.right ?? selection.right,
        );
      await qc.cancelQueries({ queryKey: handKeys.selection(owner, job, selection.personIndex) });
      await qc.cancelQueries({
        queryKey: ["body", owner, job, selection.personIndex],
        predicate: (q) => q.queryKey[4] === "images",
      });
    },
    onSuccess: async (selection) => {
      replayObservation(
        "hand_selection",
        {
          personIndex: selection.personIndex,
          left: selection.left,
          right: selection.right,
          revision: selection.revision,
          libraryHash: selection.library_sha256,
        },
        job,
      );
      featureAction("hand_library", "applied", job, { personIndex: selection.personIndex });
      qc.setQueryData(handKeys.selection(owner, job, selection.personIndex), selection);
      await qc.invalidateQueries({
        queryKey: ["body", owner, job, selection.personIndex],
        predicate: (q) => q.queryKey[4] === "images",
      });
    },
    onError: async (error, { selection }) => {
      featureAction("hand_library", "failed", job, {
        ...failureProperties(error, "hand_library"),
        personIndex: selection.personIndex,
      });
      if (error instanceof ApiError && error.status === 409) {
        await qc.invalidateQueries({ queryKey: handKeys.catalog(owner) });
      }
      await qc.invalidateQueries({
        queryKey: ["body", owner, job, selection.personIndex],
        predicate: (q) => q.queryKey[4] === "images",
      });
      // A lost PUT response may still have committed on the server.
      await qc.invalidateQueries({
        queryKey: handKeys.selection(owner, job, selection.personIndex),
      });
      if (error instanceof ApiError && error.status === 409) {
        await Promise.all(
          applicablePeople
            .filter((p) => p !== selection.personIndex)
            .map((p) => qc.invalidateQueries({ queryKey: handKeys.selection(owner, job, p) })),
        );
      }
    },
  });
  const catalogError = visibleError(catalog);
  const entries = (active ? applicablePeople : []).map((personIndex, i) => ({
    personIndex,
    selection: queries[i]?.data,
    // A background re-read of a held selection keeps it usable; the server re-checks hands
    // on every prepare, poll and file. Only an invalidated selection (e.g. after a failed
    // change whose PUT may have committed) waits for the new answer.
    loading:
      queries[i]?.isPending ||
      (queries[i]?.isFetching &&
        qc.getQueryState(handKeys.selection(owner, job, personIndex))?.isInvalidated !== false),
    error:
      (queries[i] ? visibleError(queries[i]!) : null) ??
      catalogError ??
      (catalog.data &&
      queries[i]?.data &&
      catalog.data.library_sha256 !== queries[i]!.data!.library_sha256
        ? new Error("손 목록이 변경되었습니다. 다시 불러와 주세요.")
        : null),
    retry: async () => {
      await catalog.refetch();
      await queries[i]?.refetch();
    },
  }));
  const pendingCount = useIsMutating({ mutationKey: ["hand-change", owner, job] });
  const pending = active && pendingCount > 0;
  const ready =
    !active ||
    (!!catalog.data && entries.every((e) => e.selection && !e.loading && !e.error) && !pending);
  return {
    jobId: job,
    enabled: active,
    catalog: catalog.data,
    entries,
    ready,
    pending,
    error: active && (!!catalogError || entries.some((e) => e.error)),
    changeError: mutation.error,
    change: (selection: HandSelection, patch: { left?: string; right?: string }) => {
      if (active && applicablePeople.includes(selection.personIndex))
        mutation.mutate({ selection, patch });
    },
  };
}
export type HandsState = ReturnType<typeof useHands>;
