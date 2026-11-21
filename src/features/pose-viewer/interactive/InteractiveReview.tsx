import { selectionSkinPreview } from "../skin/selectionSkinPreview";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExpandablePose, type SurfaceView } from "./InteractivePose";
import { prepareSurface, solvedCamera } from "./solved";
import type { ModelResult } from "./http";
import type { StaticAsset } from "./contract";
import { loadSkinSurface, sameSkin, type SkinPreview } from "../skin/skinPreview";
import { selectedSkin, type Skin } from "../skin/skin";
export type InteractiveReviewData = {
  skin?: Skin;
  selectionSkin?: { location: string; candidateId: string; baseBinding: string };
  skinPreview?: SkinPreview;
  skinState?: { stateHash: string; revision: number };
  outlineWidth?: number;
  model?: ModelResult;
  asset?: StaticAsset;
  viewKey: string;
  notice: string;
  failed: boolean;
  localSurface?: SurfaceView;
  onFrame?: (element: HTMLElement) => void;
};
export function InteractiveReview({ data, fallback }: { data: InteractiveReviewData; fallback?: ReactNode }) {
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
  const location = data.selectionSkin?.location,
    candidateId = data.selectionSkin?.candidateId,
    baseBinding = data.selectionSkin?.baseBinding;
  const stateHash = data.skinState?.stateHash,
    revision = data.skinState?.revision;
  const authoritativePreview =
    preview && chosenSkin && sameSkin(chosenSkin, preview.skin) && stateHash && revision &&
    data.model?.packet.stateHash === stateHash && data.model.packet.revision === revision
      ? preview
      : undefined;
  const [retrySkin, setRetrySkin] = useState(0);
  const [skinFailed, setSkinFailed] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<
    Awaited<ReturnType<typeof selectionSkinPreview>> & { baseBinding: string; skin: Skin }
  >();
  useEffect(() => {
    if (authoritativePreview || !chosenSkin || !location || !candidateId || !baseBinding || !source) return;
    const abort = new AbortController();
    void selectionSkinPreview(location, candidateId, chosenSkin, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setSelectedPreview({ ...result, baseBinding, skin: chosenSkin });
      })
      .catch(() => {
        if (!abort.signal.aborted) setSkinFailed(true);
      });
    return () => abort.abort();
  }, [location, candidateId, baseBinding, chosenSkin, source, authoritativePreview, retrySkin]);
  const localPreview =
    !authoritativePreview &&
    selectedPreview &&
    selectedPreview.baseBinding === baseBinding &&
    chosenSkin &&
    sameSkin(selectedPreview.skin, chosenSkin)
      ? selectedPreview
      : undefined;
  const effectivePreview = authoritativePreview ?? localPreview?.skinPreview;
  const [overlay, setOverlay] = useState<{
    source: typeof source;
    preview: SkinPreview;
    display: Awaited<ReturnType<typeof loadSkinSurface>>;
  }>();
  useEffect(() => {
    setSkinFailed(false);
    if (
      !chosenSkin ||
      !source ||
      !effectivePreview ||
      (!localPreview && (!stateHash || !revision)) ||
      !data.model ||
      !sameSkin(chosenSkin, effectivePreview.skin)
    )
      return;
    const identity = data.model.state.identity;
    if (
      identity.scope !== "full" ||
      identity.body.characterId !== effectivePreview.compatibility.characterId ||
      identity.body.characterSha256 !== effectivePreview.compatibility.characterSha256 ||
      (!localPreview &&
        (data.model.packet.stateHash !== stateHash || data.model.packet.revision !== revision))
    ) {
      setSkinFailed(true);
      return;
    }
    const abort = new AbortController();
    void loadSkinSurface(
      effectivePreview,
      localPreview
        ? { baseSelectionHash: localPreview.baseSelectionHash }
        : { stateHash: stateHash!, revision: revision! },
      source.body,
      data.model.state.model,
      abort.signal,
    )
      .then((display) => {
        if (abort.signal.aborted) {
          display.release();
          return;
        }
        setOverlay({ source, preview: effectivePreview!, display });
      })
      .catch(() => {
        if (!abort.signal.aborted) setSkinFailed(true);
      });
    return () => {
      abort.abort();
    };
  }, [source, chosenSkin, effectivePreview, localPreview, stateHash, revision, data.model, retrySkin]);
  useEffect(() => () => overlay?.display.release(), [overlay]);
  const display = useMemo(
    () =>
      chosenSkin
        ? overlay && source && overlay.source === source && sameSkin(chosenSkin, overlay.preview.skin)
          ? { ...source!, body: overlay.display.body }
          : source
        : source,
    [chosenSkin, overlay, source],
  );
  const skinNotice = data.failed
    ? data.notice || "저장할 모습을 불러오지 못했어요. 다시 시도해 주세요."
    : data.skin &&
        (!overlay || overlay.source !== source || !sameSkin(data.skin, overlay.preview.skin))
      ? skinFailed
        ? "스킨을 불러오지 못했어요."
        : "스킨 불러오는 중"
      : "";
  return (
    <div className="relative h-full w-full">
      <ExpandablePose
        fallback={fallback}
        loading={
          (!source && !data.asset && !data.failed) ||
          (!!data.skin &&
            !data.failed &&
            (!overlay || overlay.source !== source || !sameSkin(data.skin, overlay.preview.skin)) &&
            !skinFailed)
        }
        asset={data.model || data.skin ? undefined : data.asset}
        surface={display}
        viewKey={data.viewKey}
        outlineWidth={data.outlineWidth}
        onFrame={data.onFrame}
      />
      {(skinNotice || data.notice) && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-2 left-2 right-2 z-[20] rounded bg-surface-0/95 p-2 text-center text-xs text-text-secondary"
        >
          {skinNotice || data.notice}
          {skinFailed && !data.failed && skinNotice && (
            <button
              type="button"
              className="pointer-events-auto ml-2 underline"
              onClick={() => setRetrySkin((attempt) => attempt + 1)}
            >
              스킨 다시 불러오기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
