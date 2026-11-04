import { replayObservation } from "@/shared/lib/replayBridge";
import { replayActive, storeReplayAsset } from "./client";
const canvasTimes = new WeakMap<HTMLCanvasElement, number>();
const canvasHashes = new WeakMap<HTMLCanvasElement, string>();
/** Called immediately after render, without preserveDrawingBuffer or continuous readback. */
export function recordCanvasFrame(
  canvas: HTMLCanvasElement,
  metadata: Record<string, unknown> = {},
) {
  if (
    !replayActive() ||
    document.hidden ||
    performance.now() - (canvasTimes.get(canvas) ?? -1000) < 500
  )
    return;
  canvasTimes.set(canvas, performance.now());
  try {
    const output = document.createElement("canvas");
    const ratio = Math.min(1, 640 / Math.max(canvas.width, canvas.height));
    output.width = Math.max(1, Math.round(canvas.width * ratio));
    output.height = Math.max(1, Math.round(canvas.height * ratio));
    const ctx = output.getContext("2d");
    if (!ctx) throw new Error("unsupported");
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    output.toBlob(
      (blob) => {
        if (!blob || !replayActive()) return;
        void storeReplayAsset(blob, {
          kind: metadata.preview === "review_model" ? "final" : "canvas_frame",
          snapshotVersion: "canvas-v1",
        })
          .then((assetHash) => {
            if (canvasHashes.get(canvas) === assetHash) return;
            canvasHashes.set(canvas, assetHash);
            replayObservation("canvas_frame", {
              assetHash,
              width: output.width,
              height: output.height,
              ...metadata,
            });
          })
          .catch(() => replayObservation("replay_gap", { reason: "canvas_unavailable" }));
      },
      "image/jpeg",
      0.65,
    );
  } catch {
    replayObservation("replay_gap", { reason: "canvas_unavailable" });
  }
}
