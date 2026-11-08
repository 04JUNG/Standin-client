import "../pages/selectionWorkspace.css";
import { MAX_OUTLINE_WIDTH } from "../outline/outlineSettings";
import { loadSelectionPacket } from "../interactive/selectionPacket";
import { useEffect, useState } from "react";
import type { BodyEntry } from "@/features/body-selection/hooks";
import { useBodyOwner } from "@/features/body-selection/hooks";
import type { PersonResult, PoseCandidate } from "../api/pose.contract";
import { previewScope } from "../api/outputScope";
import { InteractivePose, type SurfaceView } from "../interactive/InteractivePose";
import { usePreviewAppearance } from "../interactive/previewAppearanceStore";
import { candidatePosterOptions, presentationPosterOptions } from "../api/candidatePoster";
import { useDefaultPosePoster } from "../api/posePoster";
import { matchesDefaultPosterView } from "../interactive/staticPosterView";

type PreviewMode = "static" | "chosen";
type PacketState = { binding: string; surface?: SurfaceView; failed?: boolean };

export function SelectionPreview({
  job,
  person,
  selectedId,
  entry,
  bodiesEnabled,
  canonicalPreview = false,
  presentationPosters = false,
  renderLayer = 0,
}: {
  job: string;
  person: PersonResult;
  selectedId?: string;
  entry?: BodyEntry;
  bodiesEnabled: boolean;
  canonicalPreview?: boolean;
  presentationPosters?: boolean;
  renderLayer?: number;
}) {
  const owner = useBodyOwner();
  const candidate = person.candidates.find((c) => c.id === selectedId) ?? person.candidates[0];
  const appearanceKey = JSON.stringify([owner, job, person.index]);
  const [appearance, setAppearance] = usePreviewAppearance(appearanceKey);
  const presentation = person.posePresentation;
  const presentationCandidate =
    presentation && (presentationPosters || candidate?.manualExportAllowed)
      ? [
          ...presentation.library_candidates,
          ...presentation.review_candidates,
          ...presentation.generated_candidates,
        ].find((c) => c.candidate_id === candidate?.id)
      : undefined;
  const poster = useDefaultPosePoster(
    presentationCandidate
      ? presentationPosterOptions(
          presentationCandidate,
          presentationPosters ? presentation?.output_scope : previewScope(person),
          presentation?.version === "semantic-pose-presentation-v1",
        )
      : candidatePosterOptions(candidate),
  );
  const image = poster.data?.url || (!presentationCandidate ? candidate?.thumbnailUrl : undefined);
  const alt = candidate ? `${candidate.title} 포즈 이미지` : "";
  const selection = entry?.selection;
  const scope = previewScope(person);
  const baseAsset = candidate?.interactivePreview?.asset;
  // Static byte delivery is bound to the server's current unshaped body selection.
  const asset =
    baseAsset &&
    (!bodiesEnabled ||
      (entry?.ready &&
        !selection?.shape &&
        baseAsset.characterId === selection?.resolvedBody?.characterId &&
        baseAsset.characterSha256 === selection.resolvedBody.assetSha256))
      ? baseAsset
      : undefined;
  const candidateBinding = JSON.stringify([
    appearanceKey,
    candidate?.id,
    candidate?.sourceBvhSha256,
    scope,
    baseAsset?.sha256,
    baseAsset?.camera,
  ]);
  const binding = JSON.stringify([
    candidateBinding,
    selection?.selectionRevision,
    selection?.resolvedBody,
    selection?.shape?.shapeSha256,
  ]);
  const [requested, setRequested] = useState<{ binding: string; mode: PreviewMode }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setRequested(undefined), [binding]);
  const canLoadChosen = !!(canonicalPreview && bodiesEnabled && candidate && owner);
  const hasPoster = !!(presentationCandidate || candidate?.posterUrl || image);
  const mode =
    requested?.binding === binding ? requested.mode : !hasPoster && asset ? "static" : undefined;
  const loadChosen = mode === "chosen" && canLoadChosen && !!entry?.ready && !!selection;
  const { surface, failed } = useChosenSurface(
    job,
    candidate,
    selection,
    scope,
    JSON.stringify([binding, attempt]),
    loadChosen,
  );
  const displayAsset = mode === "static" ? asset : undefined;
  const displaySurface = mode === "chosen" && loadChosen ? surface : undefined;
  const showModel = !!(displayAsset || displaySurface);
  const failedChosen = mode === "chosen" && (failed || !!entry?.error);
  const matchingDefault = !!(asset && matchesDefaultPosterView(asset, poster.data?.camera));
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
        {showModel ? (
          <InteractivePose
            key={`${binding}:${mode}`}
            surface={displaySurface}
            asset={displayAsset}
            viewKey={`${candidateBinding}:selection:${mode}`}
            fallback={
              image ? (
                <img className="h-full w-full object-contain" src={image} alt={alt} />
              ) : undefined
            }
            large
            renderLayer={renderLayer}
            appearance={appearance}
          />
        ) : image ? (
          <img className="h-full w-full object-contain" src={image} alt={alt} />
        ) : candidate ? (
          <div
            role="status"
            className="flex h-full items-center justify-center p-4 text-center text-xs text-text-secondary"
          >
            {hasPoster && poster.isPending
              ? "포즈 이미지 불러오는 중…"
              : "포즈 이미지를 표시할 수 없어요."}
          </div>
        ) : null}
        {mode === "chosen" && !showModel && (
          <p
            role="status"
            className="absolute inset-x-2 bottom-2 z-[20] rounded bg-surface-0/95 p-2 text-center text-xs text-text-secondary"
          >
            {failedChosen
              ? "선택한 체형의 3D를 불러오지 못했어요."
              : "선택한 체형의 3D를 준비하는 중…"}
          </p>
        )}
      </div>
      {(asset || canLoadChosen) && (
        <div className="relative z-[20] flex flex-wrap gap-2 bg-surface-0 px-3 pt-2 text-xs">
          {asset && (
            <button
              type="button"
              aria-pressed={mode === "static"}
              className="rounded-md border px-3 py-1 aria-pressed:border-brand-coral aria-pressed:text-brand-coral"
              onClick={() => setRequested({ binding, mode: "static" })}
            >
              {matchingDefault ? "기본 체형 3D로 회전" : "검색 각도에서 3D 보기"}
            </button>
          )}
          {canLoadChosen && (
            <button
              type="button"
              aria-pressed={mode === "chosen" && !failedChosen}
              className="rounded-md border px-3 py-1 aria-pressed:border-brand-coral aria-pressed:text-brand-coral"
              onClick={() => {
                if (mode === "chosen" && !failedChosen) return;
                if (entry?.error) void entry.retry();
                setAttempt((previous) => previous + 1);
                setRequested({ binding, mode: "chosen" });
              }}
            >
              {failedChosen ? "3D 다시 시도" : "선택한 체형으로 3D 보기"}
            </button>
          )}
          {hasPoster && (
            <button
              type="button"
              aria-pressed={!mode}
              className="rounded-md border px-3 py-1 aria-pressed:border-brand-coral aria-pressed:text-brand-coral"
              onClick={() => setRequested(undefined)}
            >
              포즈 이미지 보기
            </button>
          )}
        </div>
      )}
      <div className="selection-preview-settings">
        {showModel && (
          <p className="text-[11px] text-text-secondary">모델을 잡고 위아래로 이동 · 좌우로 회전</p>
        )}
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

function useChosenSurface(
  job: string,
  candidate: PoseCandidate | undefined,
  selection: BodyEntry["selection"],
  scope: string,
  binding: string,
  enabled: boolean,
): Omit<PacketState, "binding"> {
  const [packet, setPacket] = useState<PacketState>();
  useEffect(() => {
    setPacket(undefined);
    if (!enabled || !candidate || !selection) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    void loadSelectionPacket(job, selection, candidate, scope, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          result.release();
          return;
        }
        release = () => result.release();
        setPacket({ binding, surface: { body: result.body, camera: result.camera } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPacket({ binding, failed: true });
      });
    return () => {
      controller.abort();
      release?.();
    };
    // Binding includes the candidate/source/camera, selection and scope. Asset or appearance
    // updates can replace object references without changing the requested surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, enabled]);
  return enabled && packet?.binding === binding ? packet : {};
}
