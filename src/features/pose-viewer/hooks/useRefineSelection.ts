import { canUseInteractiveOperations } from "../interactive/capability";
import { canRefineCandidate, canReleaseRefine } from "../api/routedSearch";
import { useEffect } from "react";
import type { RefineOutcome } from "../api/refine.contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import { useExportStore } from "@/features/export/store/exportStore";
import { modelRenderingAvailable } from "../preview/modelSupport";
import type { AnalysisResult } from "../api/pose.contract";
import { refineService } from "../api/refine.service";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { beginWork } from "@/shared/stores/workActivityStore";
import { refineResultStatus, type SelectedRefineProgress } from "../lib/selectedRefineProgress";

export type RefineStatus = "idle" | "running" | "done";
const MAX_PARALLEL = 3;

/** Request/cache ownership survives app↔bar remounts; selection/owner changes abort it. */
export function useRefineSelection(data: AnalysisResult | undefined) {
  const client = useQueryClient();
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const selectedByPerson = usePoseSelectionStore((s) => s.selectedByPerson);
  const refineByPerson = usePoseSelectionStore((s) => s.refineByPerson);
  const serverJobId = usePoseSelectionStore((s) => s.serverJobId);
  const binding = JSON.stringify([owner, data?.jobId, selectedByPerson]);
  const progressKey = ["selected-refine-progress", binding];
  const progress = useQuery<SelectedRefineProgress[]>({
    queryKey: progressKey,
    queryFn: () => [],
    enabled: false,
    initialData: [],
  });
  const query = useQuery({
    queryKey: ["selected-refine", binding],
    enabled: !!data && (data.source === "semantic" || serverJobId === data.jobId),
    staleTime: Infinity,
    gcTime: 600_000,
    retry: false,
    queryFn: async () => {
      const result = data!;
      const picks = selectedByPerson;
      const controller = new AbortController();
      let finished = false;
      const current = () => {
        const state = usePoseSelectionStore.getState();
        return (
          !finished &&
          !controller.signal.aborted &&
          state.serverJobId === result.jobId &&
          JSON.stringify([
            useInstallationStore.getState().credentials?.installationId ?? "",
            result.jobId,
            state.selectedByPerson,
          ]) === binding
        );
      };
      const cancel = () => {
        controller.abort();
        client.setQueryData<SelectedRefineProgress[]>(progressKey, (entries = []) =>
          entries.map((entry) =>
            ["requested", "refining", "preparing"].includes(entry.status)
              ? { ...entry, status: "cancelled" }
              : entry,
          ),
        );
      };
      const cancelObsolete = () => {
        if (!current()) cancel();
      };
      const unsubscribe = usePoseSelectionStore.subscribe(cancelObsolete);
      const unsubscribeOwner = useInstallationStore.subscribe(cancelObsolete);
      const unsubscribeCache = client.getQueryCache().subscribe((event) => {
        if (
          event.type === "removed" &&
          event.query.queryKey[0] === "selected-refine" &&
          event.query.queryKey[1] === binding
        )
          cancel();
      });
      const entries: SelectedRefineProgress[] = [];
      const outcomes: RefineOutcome[] = [];
      const report = (
        personIndex: number,
        candidateId: string,
        status: SelectedRefineProgress["status"],
        target?: SelectedRefineProgress["target"],
      ) => {
        if (!current()) return;
        const entry = {
          jobId: result.jobId,
          personIndex,
          candidateId,
          status,
          enteredAt: Date.now(),
          ...(status === "refining" && target ? { target } : {}),
        };
        const index = entries.findIndex((p) => p.personIndex === personIndex);
        if (index < 0) entries.push(entry);
        else entries[index] = entry;
        client.setQueryData(progressKey, [...entries]);
      };
      const finishWork = beginWork();
      try {
        const targets =
          result.source !== "semantic" &&
          (result.capabilities.refine || result.capabilities.refineRelease)
            ? result.people.flatMap((person) => {
                const candidateId = picks[person.index];
                // Search confidence and manual release are separate from refine eligibility.
                if (
                  !candidateId ||
                  !(result.capabilities.refineRelease
                    ? result.people.length === 1 &&
                      canReleaseRefine(person.candidates.find((c) => c.id === candidateId))
                    : person.refineAllowed &&
                      canRefineCandidate(person.candidates.find((c) => c.id === candidateId)))
                )
                  return [];
                const saved = usePoseSelectionStore.getState().refineByPerson[person.index];
                if (
                  result.capabilities.bodyPreviews &&
                  saved?.jobId === result.jobId &&
                  saved.candidateId === candidateId
                )
                  return [];
                return [{ personIndex: person.index, candidateId }];
              })
            : [];

        for (const person of result.people) {
          const candidateId = picks[person.index];
          if (!candidateId) continue;
          const requested = targets.some((t) => t.personIndex === person.index);
          const saved = usePoseSelectionStore.getState().refineByPerson[person.index];
          const reused =
            !requested && saved?.jobId === result.jobId && saved.candidateId === candidateId
              ? saved
              : undefined;
          if (reused) outcomes.push(reused);
          report(
            person.index,
            candidateId,
            requested ? "requested" : reused ? refineResultStatus(reused) : "skipped",
          );
        }
        const queue = [...targets];
        const worker = async () => {
          for (let next = queue.shift(); next && current(); next = queue.shift()) {
            const target = next;
            try {
              const outcome = await refineService.refineSelection({
                jobId: result.jobId,
                personIndex: next.personIndex,
                candidateId: next.candidateId,
                signal: controller.signal,
                onProgress: (phase, observedTarget) =>
                  report(target.personIndex, target.candidateId, phase, observedTarget),
                ...(result.capabilities.refineRelease ? { releaseVersion: "RC4" as const } : {}),
                ...((canUseInteractiveOperations(result.capabilities) ||
                  (result.capabilities.modelPreview &&
                    modelRenderingAvailable() &&
                    result.capabilities.outputScopeCropping)) &&
                result.capabilities.fbxExport &&
                useExportStore.getState().format === "fbx"
                  ? { deferPreview: true }
                  : {}),
              });
              if (!current()) return;
              if (
                outcome.jobId !== result.jobId ||
                outcome.personIndex !== next.personIndex ||
                outcome.candidateId !== next.candidateId
              )
                throw new Error("Refine selection changed");
              outcomes.push(outcome);
              usePoseSelectionStore.getState().setRefineOutcome(outcome);
              report(next.personIndex, next.candidateId, refineResultStatus(outcome));
            } catch {
              report(
                next.personIndex,
                next.candidateId,
                controller.signal.aborted ? "cancelled" : "failed",
              );
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, targets.length) }, worker));
        controller.signal.throwIfAborted();
        return outcomes;
      } finally {
        finished = true;
        unsubscribe();
        unsubscribeOwner();
        unsubscribeCache();
        finishWork();
      }
    },
  });
  useEffect(() => {
    for (const outcome of query.data ?? []) {
      if (
        outcome.jobId === data?.jobId &&
        selectedByPerson[outcome.personIndex] === outcome.candidateId &&
        usePoseSelectionStore.getState().refineByPerson[outcome.personIndex] !== outcome
      )
        usePoseSelectionStore.getState().setRefineOutcome(outcome);
    }
  }, [query.data, data?.jobId, selectedByPerson]);
  const selectedRefineProgress = (progress.data ?? []).filter(
    (p) => p.jobId === data?.jobId && selectedByPerson[p.personIndex] === p.candidateId,
  );
  return {
    status: (query.isSuccess || query.isError
      ? "done"
      : query.isFetching
        ? "running"
        : "idle") as RefineStatus,
    selectedRefineProgress,
    refineByPerson,
    appliedCount: Object.values(refineByPerson).filter(
      (o) =>
        o.refined && o.jobId === data?.jobId && selectedByPerson[o.personIndex] === o.candidateId,
    ).length,
  };
}
