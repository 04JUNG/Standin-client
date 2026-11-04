import { useEffect, useSyncExternalStore } from "react";
import { interactiveController, interactiveVersion, subscribeInteractive } from "./session";
export function useInteractiveReviews({
  enabled,
  owner,
  jobId,
  requests,
}: {
  enabled: boolean;
  owner: string;
  jobId?: string;
  requests: { binding: string; personIndex: number; candidateId: string; ready: boolean }[];
}) {
  useSyncExternalStore(subscribeInteractive, interactiveVersion, interactiveVersion);
  const controllers =
    enabled && owner && jobId
      ? requests.map((r) => interactiveController(owner, jobId, r.personIndex))
      : [];
  const requestKey = JSON.stringify([enabled, owner, jobId, requests]);
  useEffect(() => {
    controllers.forEach((controller, i) => {
      const r = requests[i];
      controller.select(r.binding, r.candidateId, r.ready);
    });
    // Controller identity is session-scoped. Main↔bar remount is not cancellation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const snapshots = controllers.map((c) => c.snapshot());
  return {
    controllers,
    snapshots,
    ready:
      enabled &&
      controllers.length > 0 &&
      requests.every((r, i) => r.ready && controllers[i]?.ready(r.binding)),
    failed:
      enabled &&
      snapshots.some(
        (s, i) => s.binding === requests[i]?.binding && (s.error || s.exportState === "failed"),
      ),
    retry() {
      controllers.forEach((c) => c.retry());
    },
  };
}
