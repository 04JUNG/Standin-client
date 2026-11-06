import { useEffect, useMemo, useState } from "react";
import { ExpandablePose, type SurfaceView } from "./InteractivePose";
import { prepareSurface, solvedCamera } from "./solved";
import type { ModelResult } from "./http";
import type { StaticAsset } from "./contract";
export type InteractiveReviewData = {
  outlineWidth?: number;
  model?: ModelResult;
  asset?: StaticAsset;
  viewKey: string;
  notice: string;
  failed: boolean;
  localSurface?: SurfaceView;
  onFrame?: (element: HTMLElement) => void;
};
export function InteractiveReview({ data }: { data: InteractiveReviewData }) {
  const [prepared, setPrepared] = useState<
    ReturnType<typeof prepareSurface> & {
      camera: import("./contract").SearchCamera;
      model: ModelResult;
    }
  >();
  useEffect(() => {
    const model = data.model;
    if (!model?.frame) {
      setPrepared(undefined);
      return;
    }
    let result: ReturnType<typeof prepareSurface> | undefined;
    try {
      result = prepareSurface(model.state.model);
      setPrepared({ ...result, camera: solvedCamera(model.state, model.frame), model });
    } catch {
      setPrepared(undefined);
    }
    return () => result?.release();
  }, [data.model]);
  const surface = useMemo(
    () =>
      prepared &&
      data.model?.state.identity.selection.candidate ===
        prepared.model.state.identity.selection.candidate
        ? { body: prepared.body, camera: prepared.camera }
        : undefined,
    [prepared, data.model],
  );
  return (
    <div className="relative h-full w-full">
      <ExpandablePose
        asset={data.model ? undefined : data.asset}
        surface={data.localSurface ?? surface}
        viewKey={data.viewKey}
        outlineWidth={data.outlineWidth}
        onFrame={data.onFrame}
      />
      {data.notice && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-2 left-2 right-2 z-[20] rounded bg-surface-0/95 p-2 text-center text-xs text-text-secondary"
        >
          {data.notice}
        </div>
      )}
    </div>
  );
}
