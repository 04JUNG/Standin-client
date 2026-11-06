import { useEffect, useMemo, useState } from "react";
import { ExpandablePose, type SurfaceView } from "./InteractivePose";
import { prepareSurface, solvedCamera } from "./solved";
import type { ModelResult } from "./http";
import type { StaticAsset } from "./contract";
import { loadSkinSurface, sameSkin, type SkinPreview } from "../skin/skinPreview";
import { selectedSkin, type Skin } from "../skin/skin";
import { SkinControl } from "../skin/SkinControl";
import type { SkinId } from "../skin/skinChoices";
export type InteractiveReviewData = {
  skin?: Skin;
  skinPreview?: SkinPreview;
  skinState?: { stateHash: string; revision: number };
  skinControl?: { personIndex: number; available: readonly SkinId[] };
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
  const source = data.localSurface ?? surface;
  const desiredId = data.skin?.id ?? "default";
  const chosenSkin = useMemo(() => selectedSkin(desiredId), [desiredId]);
  const previewJson = JSON.stringify(data.skinPreview);
  const preview = useMemo<SkinPreview | undefined>(
    () => (previewJson ? JSON.parse(previewJson) : undefined),
    [previewJson],
  );
  const stateHash = data.skinState?.stateHash,
    revision = data.skinState?.revision;
  const [overlay, setOverlay] = useState<{
    source: typeof source;
    preview: SkinPreview;
    display: Awaited<ReturnType<typeof loadSkinSurface>>;
  }>();
  const [skinFailed, setSkinFailed] = useState(false);
  useEffect(() => {
    setOverlay(undefined);
    setSkinFailed(false);
    if (
      !chosenSkin ||
      !source ||
      !preview ||
      !stateHash ||
      !revision ||
      !data.model ||
      !sameSkin(chosenSkin, preview.skin)
    )
      return;
    const identity = data.model.state.identity;
    if (
      identity.scope !== "full" ||
      identity.body.characterId !== preview.compatibility.characterId ||
      identity.body.characterSha256 !== preview.compatibility.characterSha256 ||
      data.model.packet.stateHash !== stateHash ||
      data.model.packet.revision !== revision
    ) {
      setSkinFailed(true);
      return;
    }
    const abort = new AbortController();
    let result: Awaited<ReturnType<typeof loadSkinSurface>> | undefined;
    void loadSkinSurface(
      preview,
      { stateHash, revision },
      source.body,
      data.model.state.model,
      abort.signal,
    )
      .then((display) => {
        if (abort.signal.aborted) {
          display.release();
          return;
        }
        result = display;
        setOverlay({ source, preview: preview!, display });
      })
      .catch(() => {
        if (!abort.signal.aborted) setSkinFailed(true);
      });
    return () => {
      abort.abort();
      result?.release();
    };
  }, [source, chosenSkin, preview, stateHash, revision, data.model]);
  const display = useMemo(
    () =>
      chosenSkin
        ? overlay &&
          source &&
          overlay.source === source &&
          overlay.preview === preview &&
          sameSkin(chosenSkin, overlay.preview.skin)
          ? { ...source!, body: overlay.display.body }
          : undefined
        : source,
    [chosenSkin, overlay, source, preview],
  );
  const skinNotice =
    data.skin && !display
      ? skinFailed
        ? "스킨을 불러오지 못했어요. 다시 시도해 주세요."
        : "스킨 불러오는 중"
      : "";
  return (
    <div className="relative h-full w-full">
      <ExpandablePose
        loading={
          (!source && !data.asset && !data.failed) || (!!data.skin && !display && !skinFailed)
        }
        asset={data.model || data.skin ? undefined : data.asset}
        surface={display}
        viewKey={data.viewKey}
        outlineWidth={data.outlineWidth}
        onFrame={data.onFrame}
        footer={
          data.skinControl && (data.skinControl.available.length > 1 || data.skin) ? (
            <SkinControl {...data.skinControl} />
          ) : undefined
        }
      />
      {(skinNotice || data.notice) && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-2 left-2 right-2 z-[20] rounded bg-surface-0/95 p-2 text-center text-xs text-text-secondary"
        >
          {skinNotice || data.notice}
        </div>
      )}
    </div>
  );
}
