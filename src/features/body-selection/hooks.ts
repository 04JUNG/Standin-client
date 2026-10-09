import {
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { AnalysisResult, PersonResult } from "@/features/pose-viewer/api/pose.contract";
import {
  bodyKeys,
  getManifest,
  getOptions,
  getSelection,
  putSelection,
  renderBodyCandidate,
} from "./api";
import type { BodyChange, BodySelection } from "./contract";
export function useBodyOwner() {
  return useInstallationStore((s) => s.credentials?.installationId ?? "");
}
export const bodyEnabled = (result?: AnalysisResult) => result?.capabilities?.bodyPreviews === true;
export function useBodies(result: AnalysisResult | undefined) {
  const owner = useBodyOwner(),
    job = result?.jobId ?? "";
  const qc = useQueryClient();
  const enabled = bodyEnabled(result);
  const people = enabled ? (result?.people.filter((p) => p.fallbackMode !== "hard") ?? []) : [];
  const selections = useQueries({
    queries: people.map((p) => ({
      queryKey: bodyKeys.selection(owner, job, p.index),
      queryFn: ({ signal }: { signal: AbortSignal }) => getSelection(job, p.index, signal),
      enabled: !!owner,
      retry: false,
      staleTime: 0,
    })),
  });
  const groups = useQueries({
    queries: people.map((person, i) => {
      const selection = selections[i]?.data;
      return {
        queryKey: [...bodyKeys.person(owner, job, person.index), "images", selection],
        enabled: !!owner && selection?.resolutionStatus === "ready",
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const manifest = await getManifest(job, person.index, selection!, signal);
          if (
            manifest.candidates.length !== person.candidates.length ||
            manifest.candidates.some((c, i) => c.candidateId !== person.candidates[i]?.id)
          )
            throw new Error("포즈 후보가 변경되었습니다. 다시 확인해 주세요.");
          // A single query commits the complete image group; no mixed body frames.
          const images: Record<string, string> = {};
          for (const candidate of manifest.candidates) {
            signal.throwIfAborted();
            images[candidate.candidateId] = await renderBodyCandidate(manifest, candidate, signal);
          }
          return { manifest, images };
        },
        retry: false,
        staleTime: 600_000,
        gcTime: 600_000,
      };
    }),
  });
  const pending = useIsMutating({ mutationKey: ["body-change", owner, job] }) > 0;
  const entries = people.map((person, i) => ({
    personIndex: person.index,
    selection: selections[i]?.data,
    group: groups[i]?.data,
    ready:
      !pending &&
      selections[i]?.isSuccess === true &&
      !selections[i]?.isFetching &&
      groups[i]?.isSuccess === true &&
      !groups[i]?.isFetching,
    error:
      selections[i]?.error ??
      groups[i]?.error ??
      (selections[i]?.data && selections[i]?.data?.resolutionStatus !== "ready"
        ? new Error("사용할 체형을 선택해 주세요.")
        : null),
    retry: async () => {
      await selections[i]?.refetch();
      // The refreshed selection may use a different query key (or still be absent).
      // Invalidate active groups instead of invoking the old render closure.
      await qc.invalidateQueries({
        queryKey: bodyKeys.person(owner, job, person.index),
        predicate: (q) => q.queryKey[4] === "images",
      });
    },
  }));
  return {
    enabled,
    entries,
    ready: !enabled || (!!owner && !pending && entries.length > 0 && entries.every((e) => e.ready)),
  };
}
export type BodyEntry = ReturnType<typeof useBodies>["entries"][number];
export function useBodyControls(job: string, person: PersonResult, selection?: BodySelection) {
  const owner = useBodyOwner(),
    qc = useQueryClient();
  const options = useQuery({
    queryKey: [...bodyKeys.person(owner, job, person.index), "options"],
    queryFn: ({ signal }) => getOptions(job, person.index, signal),
    enabled: !!owner,
    retry: false,
  });
  const mutation = useMutation({
    mutationKey: ["body-change", owner, job, person.index],
    mutationFn: async (change: BodyChange) => {
      if (!selection) throw new Error("체형 상태를 다시 불러와 주세요.");
      return putSelection(job, person.index, change, selection.selectionRevision);
    },
    onMutate: async () => {
      await qc.cancelQueries({
        queryKey: bodyKeys.person(owner, job, person.index),
        predicate: (q) => q.queryKey[4] === "images",
      });
      qc.removeQueries({ queryKey: ["body", owner, job, person.index, "review"] });
    },
    onSuccess: (value) => {
      if (useInstallationStore.getState().credentials?.installationId === owner)
        qc.setQueryData(bodyKeys.selection(owner, job, person.index), value);
    },
    onError: async () => {
      await qc.invalidateQueries({ queryKey: bodyKeys.selection(owner, job, person.index) });
    },
  });
  return { options, mutation };
}
