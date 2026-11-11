import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BodyEntry } from "@/features/body-selection/hooks";
import type { PoseCandidate } from "../api/pose.contract";
import { previewRequests } from "../preview/requestQueue";
import { loadSelectionModel, prepareSelectionSurface } from "./selectionPacket";

/** Both search inspectors show the same server-baked surface used by final review. */
export function useSelectionSurface({
  owner,
  job,
  candidate,
  entry,
  scope,
  enabled,
}: {
  owner: string;
  job: string;
  candidate?: PoseCandidate;
  entry?: BodyEntry;
  scope: string;
  enabled: boolean;
}) {
  const selection = entry?.selection;
  const ready = !!(enabled && owner && candidate && entry?.ready && selection?.resolvedBody);
  const binding = JSON.stringify([
    owner,
    job,
    selection?.personIndex,
    candidate?.id,
    candidate?.sourceBvhSha256,
    scope,
    selection?.selectionRevision,
    selection?.resolvedBody,
    selection?.shape,
  ]);
  const query = useQuery({
    queryKey: ["selection-final-surface", binding],
    enabled: ready,
    queryFn: ({ signal }) =>
      previewRequests.run(signal, () =>
        loadSelectionModel(job, selection!, candidate!, scope, signal),
      ),
    retry: false,
    staleTime: 60_000,
    // Dense canonical packets are large. Share active inspectors without retaining
    // every previously browsed pose in memory.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [prepared, setPrepared] = useState<{
    model: typeof query.data;
    binding: string;
    surface?: ReturnType<typeof prepareSelectionSurface>;
  }>();
  useEffect(() => {
    if (!ready || !query.data) return;
    let surface: ReturnType<typeof prepareSelectionSurface> | undefined;
    try {
      surface = prepareSelectionSurface(query.data);
      setPrepared({ model: query.data, binding, surface });
    } catch {
      setPrepared({ model: query.data, binding });
    }
    return () => surface?.release();
  }, [ready, query.data, binding]);
  const current =
    ready && prepared?.binding === binding && prepared.model === query.data ? prepared : undefined;
  return {
    binding,
    surface: current?.surface,
    failed: !!(entry?.error || query.isError || (current && !current.surface)),
    loading:
      enabled && !entry?.error && (!ready || query.isPending || (!current && !query.isError)),
    retry: async () => {
      if (entry?.error) await entry.retry();
      else if (ready) await query.refetch();
    },
  };
}
