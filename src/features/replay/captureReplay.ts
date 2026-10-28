import type { ScreenFrame } from "@/features/capture/api/capture.contract";
import type { CropRect } from "@/features/capture/lib/cropFrame";
import { replayConfig } from "./config";
import { replayActive, replayGap, sendReplayEvents, storeReplayAsset } from "./client";
type Point = { x: number; y: number };
type Sample = { timestamp: number; phase: string; cursor?: Point; selection?: CropRect };
let capture:
  { frame: ScreenFrame; inputAttemptId: string; samples: Sample[]; lastMove: number } | undefined;
export function beginCaptureReplay(frame: ScreenFrame, inputAttemptId: string) {
  if (!replayConfig().captureEnabled || !replayActive()) return;
  capture = {
    frame,
    inputAttemptId,
    samples: [{ timestamp: Date.now(), phase: "start" }],
    lastMove: 0,
  };
}
export function captureReplayPoint(
  phase: "move" | "select",
  cursor: Point,
  selection: CropRect | undefined,
  viewport: { width: number; height: number },
) {
  if (!capture || !replayActive()) return;
  const now = Date.now();
  if (phase === "move" && now - capture.lastMove < 80) return;
  capture.lastMove = now;
  const sx = capture.frame.width / viewport.width,
    sy = capture.frame.height / viewport.height;
  if (capture.samples.length < 2000)
    capture.samples.push({
      timestamp: now,
      phase,
      cursor: { x: cursor.x * sx, y: cursor.y * sy },
      ...(selection ? { selection } : {}),
    });
}
/** Full desktop background never enters recorder, IDB or upload. Only selected pixels survive. */
export async function finishCaptureReplay(selection?: CropRect, file?: File) {
  const current = capture;
  capture = undefined;
  if (!current || !replayActive()) return;
  const { frame, inputAttemptId } = current;
  let backgroundAssetHash: string | undefined;
  let roughAssetHash: string | undefined;
  if (selection && file) {
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("unsupported");
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        image,
        Math.round(selection.x),
        Math.round(selection.y),
        Math.round(selection.width),
        Math.round(selection.height),
      );
      image.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((v) => (v ? resolve(v) : reject()), "image/png"),
      );
      backgroundAssetHash = await storeReplayAsset(blob, {
        kind: "capture_background",
        snapshotVersion: "capture-reconstruction-v1",
        inputAttemptId,
      });
      roughAssetHash = await storeReplayAsset(file, {
        kind: "rough",
        snapshotVersion: "capture-crop-v1",
        inputAttemptId,
      });
    } catch {
      replayGap("capture_background_missing");
    }
  }
  current.samples.push({
    timestamp: Date.now(),
    phase: selection ? "confirm" : "cancel",
    selection,
  });
  const events = current.samples.map(({ timestamp, ...sample }) => ({
    type: 5,
    timestamp,
    data: {
      tag: "capture_overlay",
      payload: {
        recordMode: "capture_overlay_reconstruction",
        width: frame.width,
        height: frame.height,
        x: 0,
        y: 0,
        monitorOrigin: { x: frame.monitor.x, y: frame.monitor.y },
        monitorBounds: frame.monitor,
        pixelScale: {
          x: frame.width / frame.monitor.width,
          y: frame.height / frame.monitor.height,
        },
        coordinates: "physical",
        restrictedToSelection: true,
        backgroundAssetHash,
        roughAssetHash,
        backgroundOmitted: !backgroundAssetHash,
        allowedRect: selection,
        inputAttemptId,
        ...sample,
      },
    },
  }));
  // Safe viewport snapshot supplies rrweb controls for the reconstructed stream.
  // It contains no native desktop DOM or unselected pixels.
  const timestamp = current.samples[0].timestamp;
  const viewport = [
    { type: 4, timestamp, data: { href: "", width: frame.width, height: frame.height } },
    {
      type: 2,
      timestamp,
      data: {
        node: {
          type: 0,
          id: 1,
          childNodes: [
            {
              type: 2,
              id: 2,
              tagName: "html",
              attributes: {},
              childNodes: [
                { type: 2, id: 3, tagName: "head", attributes: {}, childNodes: [] },
                {
                  type: 2,
                  id: 4,
                  tagName: "body",
                  attributes: { style: "margin:0;background:#111827" },
                  childNodes: [],
                },
              ],
            },
          ],
        },
        initialOffset: { left: 0, top: 0 },
      },
    },
  ];
  sendReplayEvents("capture", [...viewport, ...events], {
    inputAttemptId,
    screen: "capture_overlay",
  });
}
