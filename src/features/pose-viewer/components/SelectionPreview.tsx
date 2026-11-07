import "../pages/selectionWorkspace.css";
import { MAX_OUTLINE_WIDTH } from "../outline/outlineSettings";
import { loadSelectionPacket } from "../interactive/selectionPacket";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BodyEntry } from "@/features/body-selection/hooks";
import { useBodyOwner } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
import { previewScope } from "../api/outputScope";
import { InteractivePose } from "../interactive/InteractivePose";
import { usePreviewAppearance } from "../interactive/previewAppearanceStore";

export function SelectionPreview({
  job,
  person,
  selectedId,
  entry,
  bodiesEnabled,
  canonicalPreview = false,
  renderLayer = 0,
}: {
  job: string;
  person: PersonResult;
  selectedId?: string;
  entry?: BodyEntry;
  bodiesEnabled: boolean;
  canonicalPreview?: boolean;
  renderLayer?: number;
}) {
  const owner = useBodyOwner();
  const candidate = person.candidates.find((c) => c.id === selectedId) ?? person.candidates[0];
  const appearanceKey = JSON.stringify([owner, job, person.index]);
  const [appearance, setAppearance] = usePreviewAppearance(appearanceKey);
  const selection = entry?.selection;
  const scope = previewScope(person);
  const binding = JSON.stringify([
    owner,
    job,
    person.index,
    [candidate?.id, candidate?.sourceBvhSha256, candidate?.interactivePreview?.asset?.camera],
    selection,
    scope,
    entry?.ready,
  ]);
  const [loaded, setLoaded] = useState<{
    binding: string;
    surface: Awaited<ReturnType<typeof loadSelectionPacket>>;
  }>();
  const leases = useRef(new Set<Awaited<ReturnType<typeof loadSelectionPacket>>>());
  useEffect(() => {
    const owned = leases.current;
    return () => {
      for (const lease of owned) lease.release();
      owned.clear();
    };
  }, []);
  useEffect(() => {
    for (const lease of leases.current)
      if (lease !== loaded?.surface) {
        lease.release();
        leases.current.delete(lease);
      }
  }, [loaded]);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!canonicalPreview || !bodiesEnabled || !candidate || !selection || !entry?.ready || !owner)
      return;
    const controller = new AbortController();
    setError(undefined);
    // Only the current candidate enters the existing bounded preview queue.
    const timer = setTimeout(
      () =>
        void loadSelectionPacket(job, selection, candidate, scope, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) {
              result.release();
              return;
            }
            leases.current.add(result);
            setLoaded({ binding, surface: result });
          })
          .catch(() => {
            if (!controller.signal.aborted) setError(binding);
          }),
      120,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // binding includes all model/source/body/scope identities; appearance never fetches or reparses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, bodiesEnabled, retry, canonicalPreview]);
  const surface = useMemo(
    () => (loaded ? { body: loaded.surface.body, camera: loaded.surface.camera } : undefined),
    [loaded],
  );
  const baseAsset = candidate?.interactivePreview?.asset;
  const asset =
    !bodiesEnabled ||
    (entry?.ready &&
      !selection?.shape &&
      baseAsset?.characterId === selection?.resolvedBody?.characterId &&
      baseAsset?.characterSha256 === selection?.resolvedBody?.assetSha256)
      ? baseAsset
      : undefined;
  const lastAsset = useRef(asset);
  if (asset) lastAsset.current = asset;
  const displayAsset = asset ?? (!surface ? lastAsset.current : undefined);
  const showingPrevious =
    !asset && ((loaded && loaded.binding !== binding) || (!loaded && !!lastAsset.current));
  return (
    <section aria-label={`인물 ${person.index + 1} 큰 미리보기`} className="selection-preview">
      <div className="selection-preview-heading">
        <div>
          <h2 className="text-[13px] font-semibold">포즈 미리보기</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            {candidate ? `${candidate.rank}. ${candidate.title}` : "포즈 후보가 없습니다"}
            {candidate && !selectedId ? " · 비교 중" : ""}
          </p>
        </div>
        <span className="text-[11px] text-text-secondary">인물 {person.index + 1}</span>
      </div>
      <div className="selection-preview-model">
        {surface || displayAsset ? (
          <InteractivePose
            surface={loaded?.binding === binding || !asset ? surface : undefined}
            asset={displayAsset}
            viewKey={`${appearanceKey}:selection`}
            large
            renderLayer={renderLayer}
            appearance={appearance}
          />
        ) : (
          <div
            role="status"
            className="flex h-full items-center justify-center p-4 text-center text-xs text-text-secondary"
          >
            {error === binding || entry?.error ? (
              <div>
                <p>선택한 체형의 3D를 불러오지 못했어요.</p>
                <button
                  className="mt-2 rounded border px-3 py-2"
                  onClick={() => {
                    void entry?.retry();
                    setRetry((n) => n + 1);
                  }}
                >
                  다시 시도
                </button>
              </div>
            ) : bodiesEnabled && candidate && canonicalPreview ? (
              "이 포즈에 고른 체형을 적용하는 중…"
            ) : (
              "이 후보는 회전 미리보기를 제공하지 않습니다."
            )}
          </div>
        )}
        {showingPrevious && (
          <div
            role="status"
            className="absolute left-2 right-12 top-2 z-[20] rounded bg-surface-0/95 p-2 text-center text-xs text-text-secondary"
          >
            {error === binding || entry?.error ? (
              <>
                새 미리보기를 불러오지 못했어요. 이전 모습입니다.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    void entry?.retry();
                    setRetry((n) => n + 1);
                  }}
                >
                  다시 시도
                </button>
              </>
            ) : (
              "새 모습을 준비하는 중… 지금은 이전 미리보기입니다."
            )}
          </div>
        )}
      </div>
      <div className="selection-preview-settings">
        <p className="text-[11px] text-text-secondary">드래그로 회전 · 휠로 확대 · R로 처음 시점</p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="미리보기 스킨">
          <span className="mr-auto text-xs font-semibold">스킨</span>
          {(
            [
              ["default", "기본"],
              ["flesh", "살색"],
            ] as const
          ).map(([skin, label]) => (
            <button
              key={skin}
              type="button"
              aria-pressed={appearance.skin === skin}
              onClick={() => setAppearance((a) => ({ ...a, skin }))}
              className={`rounded-md border px-3 py-1 text-xs ${appearance.skin === skin ? "border-brand-coral text-brand-coral" : "border-border"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="shrink-0 font-semibold">외곽선</span>
          <input
            aria-label="외곽선 두께"
            className="min-w-0 flex-1 accent-brand-coral"
            type="range"
            min="0"
            max={MAX_OUTLINE_WIDTH}
            step="0.05"
            value={appearance.outlineWidth}
            onChange={(e) => setAppearance((a) => ({ ...a, outlineWidth: Number(e.target.value) }))}
          />
          <output className="w-10 text-right tabular-nums">
            {appearance.outlineWidth.toFixed(1)}
          </output>
        </label>
        <p className="text-[10px] text-text-secondary">
          이 화면의 스킨·외곽선 설정은 FBX에 저장되지 않아요.
        </p>
      </div>
    </section>
  );
}
