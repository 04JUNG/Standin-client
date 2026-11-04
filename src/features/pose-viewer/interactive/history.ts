import { captureView, observationForView } from "./renderer";
import { hex } from "./assets";
import type { InteractiveController } from "./controller";
import type { SearchCamera } from "./contract";
export type RepresentativeFrame = {
  schemaVersion: "interactive-canvas-poster-v1";
  revision: number;
  stateHash: string;
  sha256: string;
  camera: SearchCamera;
  observation: import("./camera").Observation;
  renderer: "standin-shared-viewport-v1";
  provenance: "client-canvas-auxiliary";
  png: Blob;
};
export type HistoryUpload = (frame: RepresentativeFrame, signal: AbortSignal) => Promise<void>;
const captured = new WeakMap<InteractiveController, string>();
/** One canvas-only frame for the confirmed representative, asynchronously; never a wait on save/list. */
export function queueRepresentativeFrame(
  controller: InteractiveController,
  element: HTMLElement,
  camera: SearchCamera,
  upload: HistoryUpload,
) {
  const snapshot = controller.snapshot(),
    op = snapshot.operation;
  if (
    !op?.stateHash ||
    snapshot.previewState !== "authoritative" ||
    snapshot.localSurface ||
    snapshot.model?.packet.stateHash !== op.stateHash ||
    captured.get(controller) === op.stateHash
  )
    return;
  const binding = snapshot.binding;
  const abort = new AbortController();
  const current = () => {
    const s = controller.snapshot();
    return (
      s.binding === binding &&
      s.operation?.revision === op.revision &&
      s.operation.stateHash === op.stateHash &&
      s.previewState === "authoritative" &&
      !s.localSurface
    );
  };
  const unsubscribe = controller.subscribe(() => {
    if (!current()) abort.abort();
  });
  captured.set(controller, op.stateHash);
  const run = async () => {
    try {
      if (!current()) return;
      const observation = observationForView(element);
      const png = await captureView(element);
      if (!current()) return;
      const sha256 = hex(await crypto.subtle.digest("SHA-256", await png.arrayBuffer()));
      if (!current()) return;
      await upload(
        {
          schemaVersion: "interactive-canvas-poster-v1",
          revision: op.revision,
          stateHash: op.stateHash!,
          sha256,
          camera,
          observation,
          renderer: "standin-shared-viewport-v1",
          provenance: "client-canvas-auxiliary",
          png,
        },
        abort.signal,
      );
    } catch {
      if (current())
        captured.delete(controller); /* A poster/GPU failure never touches file readiness. */
    } finally {
      unsubscribe();
    }
  };
  // Keep the representative capture out of the input/render event that settled this pose.
  setTimeout(() => {
    void run();
  }, 0);
}
