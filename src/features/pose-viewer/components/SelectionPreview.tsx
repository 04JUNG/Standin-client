import "../pages/selectionWorkspace.css";
import { MAX_OUTLINE_WIDTH } from "../outline/outlineSettings";
import { useBodyOwner, type BodyEntry } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
import { previewScope } from "../api/outputScope";
import { InteractivePose } from "../interactive/InteractivePose";
import { usePreviewAppearance } from "../interactive/previewAppearanceStore";
import { candidatePosterOptions, presentationPosterOptions } from "../api/candidatePoster";
import { useDefaultPosePoster } from "../api/posePoster";
import { useSelectionSurface } from "../interactive/useSelectionSurface";

export function SelectionPreview({
  job,
  person,
  selectedId,
  entry,
  canonicalPreview = false,
  presentationPosters = false,
  renderLayer = 0,
}: {
  job: string;
  person: PersonResult;
  selectedId?: string;
  entry?: BodyEntry;
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
  const { binding, surface, loading, failed, retry } = useSelectionSurface({
    owner,
    job,
    candidate,
    entry,
    scope,
    enabled: canonicalPreview,
  });
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
              {poster.isFetching || loading
                ? "포즈 불러오는 중…"
                : "포즈 미리보기를 표시할 수 없어요."}
            </div>
          )))
        )}
        {loading && !surface && image && (
          <p
            role="status"
            className="absolute inset-x-2 bottom-2 z-[20] rounded bg-surface-0/95 p-2 text-center text-xs"
          >
            선택한 체형의 3D를 준비하는 중…
          </p>
        )}
        {canonicalPreview && failed && !surface && (
          <button
            type="button"
            className="absolute bottom-2 right-2 z-[20] rounded border bg-surface-0 px-3 py-1 text-xs"
            onClick={() => void retry()}
          >
            3D 다시 시도
          </button>
        )}
      </div>
      <div className="selection-preview-settings">
        {surface && <p className="text-[11px] text-text-secondary">선택한 체형 · 포즈 미리보기</p>}
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
