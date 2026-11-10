import "../pages/selectionWorkspace.css";
import { MAX_OUTLINE_WIDTH } from "../outline/outlineSettings";
import { useEffect, useMemo, useState } from "react";
import { useBodyOwner } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
import { previewScope } from "../api/outputScope";
import { InteractivePose } from "../interactive/InteractivePose";
import { usePreviewAppearance } from "../interactive/previewAppearanceStore";
import {
  candidatePosterOptions,
  candidateReferenceUrl,
  presentationPosterOptions,
} from "../api/candidatePoster";
import { useDefaultPosePoster } from "../api/posePoster";
import { loadHumanTemplate, loadReferenceBvh } from "../api/humanReference";
import { referenceSurface, referenceSurfaceCamera } from "../preview/humanReference/surface";

type PosedSurface = ReturnType<typeof referenceSurface>;

export function SelectionPreview({
  job,
  person,
  selectedId,
  presentationPosters = false,
  renderLayer = 0,
}: {
  job: string;
  person: PersonResult;
  selectedId?: string;
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
  const posterOptions = presentationCandidate
    ? presentationPosterOptions(
        presentationCandidate,
        presentationPosters ? presentation?.output_scope : previewScope(person),
        presentation?.version === "semantic-pose-presentation-v1",
      )
    : candidatePosterOptions(candidate);
  const poster = useDefaultPosePoster(posterOptions);
  const image = poster.data?.url || (!presentationCandidate ? candidate?.thumbnailUrl : undefined);
  const alt = candidate ? `${candidate.title} 포즈 이미지` : "";
  const scope = posterOptions.scope ?? previewScope(person);
  const sourceUrl = candidateReferenceUrl(candidate, presentationCandidate);
  const source = posterOptions.source;
  const owned = sourceUrl?.startsWith("/v1/analysis/jobs/") ?? false;
  const scopedUrl = sourceUrl && !owned ? withScope(sourceUrl, scope) : sourceUrl;
  const binding = JSON.stringify([appearanceKey, candidate?.id, scopedUrl, source, scope]);
  const [loaded, setLoaded] = useState<{ binding: string; model?: PosedSurface }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoaded(undefined);
    if (!owner || !scopedUrl) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => {
      controller.abort();
      setLoaded({ binding });
    }, 10_000);
    let model: PosedSurface | undefined;
    void Promise.all([
      loadHumanTemplate(scope, signal),
      loadReferenceBvh(scopedUrl, source, scope, signal, owned),
    ])
      .then(([template, text]) => {
        signal.throwIfAborted();
        model = referenceSurface(template, text);
        setLoaded({ binding, model });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ binding });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
      model?.release();
    };
  }, [owner, scopedUrl, scope, source, owned, binding, attempt]);

  const result = loaded?.binding === binding ? loaded : undefined;
  const model = result?.model;
  const renderCamera = presentationCandidate?.render_camera;
  const rotation =
    presentationCandidate?.camera_kind === "fixed_117" &&
    renderCamera?.version === "pose-preview-camera-v1" &&
    renderCamera.basis === "right-handed-Y-up" &&
    renderCamera.bvh_camera_rotation_applied === false
      ? renderCamera.rotation
      : candidate?.previewModel?.sourceSha === source
        ? candidate?.previewModel?.rotation
        : undefined;
  const posterCamera = poster.data?.camera;
  const yaw = posterCamera?.fallback === "none" ? posterCamera.yaw : 0;
  const surface = useMemo(
    () => model && { body: model.body, camera: referenceSurfaceCamera(model, yaw, rotation) },
    [model, yaw, rotation],
  );
  const posterImage = image ? (
    <img className="h-full w-full object-contain" src={image} alt={alt} />
  ) : undefined;
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
        {surface ? (
          <InteractivePose
            key={binding}
            surface={surface}
            viewKey={binding}
            fallback={posterImage}
            large
            rotationOnly
            renderLayer={renderLayer}
            appearance={appearance}
          />
        ) : (
          (posterImage ??
          (candidate && (
            <div
              role="status"
              className="flex h-full items-center justify-center p-4 text-center text-xs text-text-secondary"
            >
              {poster.isFetching || (scopedUrl && !result)
                ? "포즈 불러오는 중…"
                : "포즈 미리보기를 표시할 수 없어요."}
            </div>
          )))
        )}
        {result && !model && (
          <button
            type="button"
            className="absolute bottom-2 right-2 z-[20] rounded border bg-surface-0 px-3 py-1 text-xs"
            onClick={() => {
              setLoaded(undefined);
              setAttempt((previous) => previous + 1);
            }}
          >
            3D 다시 시도
          </button>
        )}
      </div>
      <div className="selection-preview-settings">
        {surface && <p className="text-[11px] text-text-secondary">기본 체형 · 참고용 포즈</p>}
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

function withScope(sourceUrl: string, scope: string) {
  const [path, query] = sourceUrl.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("scope", scope);
  return path + "?" + params;
}
