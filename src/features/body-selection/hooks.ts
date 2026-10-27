import { localSelectionKey, useLocalBodies } from "@/features/personal-body/store";
import { invalidateFinalReview } from "@/features/export/lib/invalidateFinalReview";
import { isRetiredCharacter } from "@/features/models/lib/retiredCharacters";
import {
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { AnalysisResult, PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { previewScope, scopeIncludesHands } from "@/features/pose-viewer/api/outputScope";
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
/**
 * `excluded`: people the user will not export. Their previews may still load, but they
 * never hold back the confirm button.
 */
export function useBodies(
  result: AnalysisResult | undefined,
  excluded: Readonly<Record<number, unknown>> = {},
  renderPreviews = false,
) {
  const localSelected = useLocalBodies((s) => s.selected);
  const localModels = useLocalBodies((s) => s.models);
  const owner = useBodyOwner(),
    job = result?.jobId ?? "";
  const qc = useQueryClient();
  const enabled = bodyEnabled(result);
  const people = enabled
    ? (result?.people.filter((p) => p.fallbackMode !== "hard" && p.candidates.length > 0) ?? [])
    : [];
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
      const scope = previewScope(person);
      return {
        queryKey: [
          ...bodyKeys.person(owner, job, person.index),
          "images",
          selection,
          scope,
          person.candidates,
        ],
        enabled: renderPreviews && !!owner && selection?.resolutionStatus === "ready",
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const manifest = await getManifest(job, person.index, selection!, signal);
          if (
            manifest.outputScope !== scope ||
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
  const bodyPending = useIsMutating({ mutationKey: ["body-change", owner, job] }) > 0;
  const handPending =
    useIsMutating({
      mutationKey: ["hand-change", owner, job],
      predicate: (mutation) => {
        const index = (
          mutation.state.variables as { selection?: { personIndex?: number } } | undefined
        )?.selection?.personIndex;
        return people.some((p) => p.index === index && scopeIncludesHands(previewScope(p)));
      },
    }) > 0;
  const pending = bodyPending || handPending;
  const entries = people.map((person, i) => ({
    personIndex: person.index,
    selection: selections[i]?.data,
    group: groups[i]?.data,
    ready:
      localModels.some(
        (m) => m.localModelId === localSelected[localSelectionKey(job, person.index)],
      ) ||
      (!pending &&
        selections[i]?.isSuccess === true &&
        !selections[i]?.isFetching &&
        selections[i]?.data?.resolutionStatus === "ready" &&
        !!selections[i]?.data?.resolvedBody &&
        !isRetiredCharacter(selections[i]!.data!.resolvedBody!.characterId) &&
        (!renderPreviews || (groups[i]?.isSuccess === true && !groups[i]?.isFetching))),
    error: localSelected[localSelectionKey(job, person.index)]
      ? null
      : (selections[i]?.error ??
        groups[i]?.error ??
        (selections[i]?.data && selections[i]?.data?.resolutionStatus !== "ready"
          ? new Error(
              selections[i]?.data?.resolvedSource === "catalog_default_fallback"
                ? "남성 기본형을 불러올 수 없어요. 체형 더보기에서 다른 체형을 고르거나 다시 시도해 주세요."
                : "사용할 체형을 선택해 주세요.",
            )
          : null)),
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
    ready:
      !enabled ||
      (!!owner &&
        !pending &&
        entries.length > 0 &&
        entries.every((e) => e.personIndex in excluded || e.ready)),
  };
}
export type BodyEntry = ReturnType<typeof useBodies>["entries"][number];
export function useBodyControls(
  job: string,
  person: Pick<PersonResult, "index">,
  selection?: BodySelection,
) {
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
      invalidateFinalReview(qc, job);
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
