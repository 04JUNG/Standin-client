import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBodyOwner } from "@/features/body-selection/hooks";
import { ApiError } from "@/shared/api/client";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { getHandCatalog, getHandSelection, putHandSelection, handKeys } from "./api";
import type { HandSelection } from "./contract";

export function useHands(result: AnalysisResult | undefined, people: number[], enabled: boolean) {
  const owner = useBodyOwner(),
    qc = useQueryClient(),
    job = result?.jobId ?? "";
  const active = enabled && result?.capabilities.handSelection === true;
  const catalog = useQuery({
    queryKey: handKeys.catalog(owner),
    queryFn: ({ signal }) => getHandCatalog(signal),
    enabled: active && !!owner,
    retry: false,
    staleTime: 300_000,
  });
  const queries = useQueries({
    queries: people.map((person) => ({
      queryKey: handKeys.selection(owner, job, person),
      queryFn: ({ signal }: { signal: AbortSignal }) => getHandSelection(job, person, signal),
      enabled: active && !!owner && !!job,
      retry: false,
      staleTime: 0,
    })),
  });
  const mutation = useMutation({
    mutationFn: ({
      selection,
      patch,
    }: {
      selection: HandSelection;
      patch: { left?: string; right?: string };
    }) => putHandSelection(job, selection, patch),
    onMutate: async ({ selection }) => {
      await qc.cancelQueries({ queryKey: handKeys.selection(owner, job, selection.personIndex) });
    },
    onSuccess: (selection) => {
      qc.setQueryData(handKeys.selection(owner, job, selection.personIndex), selection);
    },
    onError: async (error, { selection }) => {
      if (error instanceof ApiError && error.status === 409) {
        await qc.invalidateQueries({ queryKey: handKeys.catalog(owner) });
      }
      // A lost PUT response may still have committed on the server.
      await qc.invalidateQueries({
        queryKey: handKeys.selection(owner, job, selection.personIndex),
      });
      if (error instanceof ApiError && error.status === 409) {
        await Promise.all(
          people
            .filter((p) => p !== selection.personIndex)
            .map((p) => qc.invalidateQueries({ queryKey: handKeys.selection(owner, job, p) })),
        );
      }
    },
  });
  const entries = people.map((personIndex, i) => ({
    personIndex,
    selection: queries[i]?.data,
    loading: queries[i]?.isPending || queries[i]?.isFetching,
    error:
      queries[i]?.error ??
      catalog.error ??
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
  const ready =
    !active ||
    (!!catalog.data &&
      entries.every((e) => e.selection && !e.loading && !e.error) &&
      !mutation.isPending);
  return {
    enabled: active,
    catalog: catalog.data,
    entries,
    ready,
    pending: mutation.isPending,
    error: active && (catalog.isError || entries.some((e) => e.error)),
    changeError: mutation.error,
    change: (selection: HandSelection, patch: { left?: string; right?: string }) =>
      mutation.mutate({ selection, patch }),
  };
}
export type HandsState = ReturnType<typeof useHands>;
