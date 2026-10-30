import { useEffect, useRef } from "react";
import type { ReviewModel, mountReviewModel } from "../preview/mountReviewModel";

export function ReviewModelPreview({
  model,
  onStatus,
  label = "저장할 포즈 미리보기",
  className = "",
  outlineWidth = 0,
}: {
  model: ReviewModel;
  label?: string;
  className?: string;
  /** Preview only; does not change export identity or trigger a model request. */
  outlineWidth?: number;
  onStatus: (status: "ready" | "failed") => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const status = useRef(onStatus);
  const width = useRef(outlineWidth);
  width.current = outlineWidth;
  const mounted = useRef<Awaited<ReturnType<typeof mountReviewModel>>>();
  status.current = onStatus;
  useEffect(() => {
    mounted.current?.setOutlineWidth(outlineWidth);
  }, [outlineWidth]);
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
        const initialWidth = width.current;
        const surface = await mountReviewModel(target, model, controller.signal, initialWidth);
        dispose = surface;
        if (controller.signal.aborted) dispose();
        else {
          mounted.current = surface;
          if (width.current !== initialWidth) surface.setOutlineWidth(width.current);
          status.current("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) status.current("failed");
      });
    return () => {
      controller.abort();
      mounted.current = undefined;
      target.removeEventListener("webglcontextlost", lost);
      dispose?.();
    };
  }, [model]);
  return (
    <canvas
      ref={canvas}
      className={`aspect-square w-full object-contain ${className}`}
      role="img"
      aria-label={label}
    />
  );
}
