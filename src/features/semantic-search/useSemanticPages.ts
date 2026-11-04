import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import { apiFetch, ApiError } from "@/shared/api/client";
import { toAnalysisResult } from "@/features/pose-viewer/api/pose.http";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";

const paused = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function pauseSemanticPages(qc: QueryClient, job?: string) {
  if (!job) return;
  if (paused.size > 200) paused.clear();
  paused.add(job);
  listeners.forEach((fn) => fn());
  void qc.cancelQueries({ queryKey: ["semantic-page", job] });
}
export function resumeSemanticPages(job?: string) {
  if (job && paused.delete(job)) listeners.forEach((fn) => fn());
}
export function mergeSemanticPage(current: AnalysisResult, delta: AnalysisResult): AnalysisResult {
  const before = current.semantic?.paging,
    next = delta.semantic?.paging;
  if (
    !before ||
    !next ||
    delta.source !== "semantic" ||
    current.people.length !== 1 ||
    delta.people.length !== 1 ||
    current.semantic!.query !== delta.semantic!.query ||
    before.matches !== next.matches ||
    before.near !== next.near ||
    current.jobId !== delta.jobId ||
    before.snapshotId !== next.snapshotId ||
    next.loaded !== Math.min(before.loaded + before.pageSize, before.total) ||
    next.loaded !== before.loaded + delta.people[0].candidates.length ||
    next.total !== before.total
  )
    throw new ApiError(502, "SEMANTIC_CONTRACT", "invalid page identity");
  const old = current.people[0],
    added = delta.people[0];
  if (new Set([...old.candidates, ...added.candidates].map((c) => c.id)).size !== next.loaded)
    throw new ApiError(502, "SEMANTIC_CONTRACT", "duplicate page");
  const presentation = old.posePresentation!,
    incoming = added.posePresentation!;
  const presented = [
    ...(incoming?.library_candidates ?? []),
    ...(incoming?.review_candidates ?? []),
  ];
  if (
    !presentation ||
    !incoming ||
    presented.length !== added.candidates.length ||
    new Set(presented.map((c) => c.candidate_id)).size !== added.candidates.length ||
    presented.some((c) => !added.candidates.some((p) => p.id === c.candidate_id))
  )
    throw new ApiError(502, "SEMANTIC_CONTRACT", "invalid page presentation");
  return {
    ...current,
    semantic: { ...current.semantic!, paging: next },
    people: [
      {
        ...old,
        candidates: [...old.candidates, ...added.candidates],
        posePresentation: {
          ...presentation,
          library_candidates: [...presentation.library_candidates, ...incoming.library_candidates],
          review_candidates: [...presentation.review_candidates, ...incoming.review_candidates],
        },
      },
    ],
  };
}
export function useSemanticPages(job?: string) {
  const qc = useQueryClient();
  const owner = useInstallationStore((s) => s.credentials?.installationId);
  const isPaused = useSyncExternalStore(subscribe, () => !!job && paused.has(job));
  const result = useQuery<AnalysisResult>({
    queryKey: poseQueryKeys.result(job ?? ""),
    enabled: false,
  });
  const info = result.data?.semantic?.paging;
  const key = ["semantic-page", job, owner, info?.nextCursor] as const;
  const page = useQuery({
    queryKey: key,
    enabled: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const raw = await apiFetch<Parameters<typeof toAnalysisResult>[0]>(
        `/v1/semantic-search/${encodeURIComponent(job!)}/pages?${new URLSearchParams({ cursor: info!.nextCursor! })}`,
        { auth: false, signal },
      );
      const delta = await toAnalysisResult(raw, signal);
      signal.throwIfAborted();
      if (owner !== useInstallationStore.getState().credentials?.installationId || paused.has(job!))
        return null;
      qc.setQueryData<AnalysisResult>(poseQueryKeys.result(job!), (current) => {
        if (!current || current.semantic?.paging?.nextCursor !== info!.nextCursor) return current;
        return mergeSemanticPage(current, delta);
      });
      return null;
    },
  });
  useEffect(
    () => () => {
      void qc.cancelQueries({ queryKey: ["semantic-page", job, owner] });
    },
    [qc, job, owner],
  );
  return info
    ? {
        info,
        pending: page.isFetching,
        error: page.error,
        paused: isPaused,
        loadMore: async () => {
          if (
            page.isFetching ||
            !info.nextCursor ||
            isPaused ||
            qc.getQueryState(key)?.fetchStatus === "fetching" ||
            qc.getQueryData<AnalysisResult>(poseQueryKeys.result(job!))?.semantic?.paging
              ?.nextCursor !== info.nextCursor
          )
            return;
          await page.refetch({ cancelRefetch: false });
        },
      }
    : undefined;
}
