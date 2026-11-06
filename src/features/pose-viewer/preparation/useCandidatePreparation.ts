import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { env } from "@/shared/lib/env";
import { z } from "zod";
import { preparationPath } from "./http";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { AnalysisResult } from "../api/pose.contract";
import { preparationSession } from "./session";
import type { PreparationSnapshot } from "./http";
import { usable } from "./contract";
const EMPTY: PreparationSnapshot = { binding: "", status: "idle" };
const emptySnapshot = () => EMPTY;
const noSubscribe = () => () => {};

/** Source-only identity. Body, shape, hands and appearance belong to selected review. */
export function useCandidatePreparation(result: AnalysisResult | undefined, live: boolean) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const eligible = live && !!result && result.source !== "semantic";
  const capability = useQuery({
    queryKey: ["candidate-preparation-capability", owner, result?.jobId],
    enabled:
      eligible &&
      !!owner &&
      result?.capabilities?.candidatePreparation === undefined &&
      !env.useMockPoseApi,
    queryFn: async ({ signal }) =>
      z
        .object({
          schemaVersion: z.literal("standin.candidate-preparation.v1"),
          candidatePreparation: z.boolean(),
          sourceOnly: z.literal(true),
          modelFormat: z.literal("bvh"),
          targetRefine: z.literal(false),
        })
        .parse(
          await apiFetch<unknown>(`${preparationPath(result!.jobId)}/capabilities`, {
            auth: false,
            signal,
          }),
        ),
    staleTime: 600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const checking =
    eligible &&
    !!owner &&
    result?.capabilities?.candidatePreparation === undefined &&
    !env.useMockPoseApi &&
    capability.isPending;
  const enabled =
    eligible &&
    (result?.capabilities?.candidatePreparation === true ||
      capability.data?.candidatePreparation === true);
  const session = useMemo(
    () => (owner && result?.jobId && enabled ? preparationSession(owner, result.jobId) : undefined),
    [owner, result?.jobId, enabled],
  );
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.snapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const identities =
    result?.people.flatMap((p) =>
      p.candidates.map((c) => ({
        personIndex: p.index,
        candidateId: c.id,
        sourceSha256: c.sourceBvhSha256,
      })),
    ) ?? [];
  // BFF owns observations/camera/policy/engine hashes. A new result object alone
  // cannot invent authority: every batch response is checked against registered IDs.
  const binding = JSON.stringify([
    owner,
    result?.jobId,
    result?.candidateSetRevision,
    identities,
    result?.people.map((p) => [
      p.index,
      p.refineAllowed,
      p.refinableLimbs,
      p.skeletonState,
      p.coverageClass,
      p.candidates.map((c) => [
        c.id,
        c.sourceCameraKey,
        c.source,
        c.refineAllowed,
        c.releaseAllowed,
        c.lookupAllowed,
        c.manualExportAllowed,
      ]),
    ]),
  ]);
  useEffect(() => {
    if (enabled && owner && identities.length > 0) session?.activate(binding, identities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, binding, enabled, owner]);
  const batch = snapshot.binding === binding ? snapshot.batch : undefined;
  const ready =
    (!enabled && !checking) ||
    identities.length === 0 ||
    (!!batch && snapshot.status === "ready" && Date.parse(batch.expiresAt) > Date.now());
  return {
    enabled: enabled || checking,
    ready: ready && !checking,
    blocked: checking || (enabled && !ready),
    binding,
    batch: ready ? batch : undefined,
    progress: batch ? `${batch.terminal}/${batch.total}` : undefined,
    failed: enabled && (snapshot.status === "failed" || snapshot.status === "cancelled"),
    retry() {
      session?.retry();
    },
    cancel() {
      session?.cancel();
    },
    canSelect(personIndex: number, candidateId: string) {
      if (!enabled) return true;
      const candidate = batch?.candidates.find(
        (c) => c.personIndex === personIndex && c.candidateId === candidateId,
      );
      return ready && !!candidate && usable(candidate.status) && !!candidate.previewAsset;
    },
  };
}
export type CandidatePreparation = ReturnType<typeof useCandidatePreparation>;
