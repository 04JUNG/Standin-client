import { useEffect, useRef } from "react";
import type { ReviewModel } from "../preview/mountReviewModel";

export function ReviewModelPreview({
  model,
  onStatus,
}: {
  model: ReviewModel;
  onStatus: (status: "ready" | "failed") => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const status = useRef(onStatus);
  status.current = onStatus;
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    const target = canvas.current!;
    const lost = (event: Event) => {
      event.preventDefault();
      if (!controller.signal.aborted) status.current("failed");
    };
    target.addEventListener("webglcontextlost", lost);
    void import("../preview/mountReviewModel")
      .then(async ({ mountReviewModel }) => {
        dispose = await mountReviewModel(target, model, controller.signal);
        if (controller.signal.aborted) dispose();
        else status.current("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) status.current("failed");
      });
    return () => {
      controller.abort();
      target.removeEventListener("webglcontextlost", lost);
      dispose?.();
    };
  }, [model]);
  return (
    <canvas
      ref={canvas}
      className="aspect-square w-full object-contain"
      role="img"
      aria-label="저장할 포즈 미리보기"
    />
  );
}
