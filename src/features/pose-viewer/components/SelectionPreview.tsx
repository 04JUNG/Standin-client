import "../pages/selectionWorkspace.css";
import { useMemo } from "react";
import { CandidateAppearanceControls } from "./CandidateAppearanceControls";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { useReferenceSkin } from "../preview/humanReference/referenceSkin";
import { useBodyOwner, type BodyEntry } from "@/features/body-selection/hooks";
import { bodyKind } from "@/features/body-selection/bodyPanel";
import type { PersonResult } from "../api/pose.contract";
import { previewScope } from "../api/outputScope";
import { InteractivePose } from "../interactive/InteractivePose";
import {
  candidatePosterOptions,
  candidateReferenceUrl,
  presentationPosterOptions,
} from "../api/candidatePoster";
import { useDefaultPosePoster } from "../api/posePoster";
import { useLocalPreview } from "../preview/humanReference/useLocalPreview";
import { referenceSurfaceCamera } from "../preview/humanReference/surface";

export function SelectionPreview({
  job,
  person,
  selectedId,
  entry,
  presentationPosters = false,
  renderLayer = 0,
}: {
  job: string;
  person: PersonResult;
  selectedId?: string;
  entry?: BodyEntry;
  presentationPosters?: boolean;
  renderLayer?: number;
}) {
  const owner = useBodyOwner();
  const candidate = person.candidates.find((c) => c.id === selectedId) ?? person.candidates[0];
  const appearanceKey = JSON.stringify([owner, job, person.index]);
  const outlineWidth = usePoseSelectionStore((s) => s.outlineByPerson[person.index] ?? 0);
  const skin = usePoseSelectionStore((s) => s.skinByPerson[person.index] ?? "default");
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
  const gender =
    bodyKind({ characterId: entry?.selection?.resolvedBody?.characterId ?? "male" }) === "female"
      ? "female"
      : "male";
  const binding = JSON.stringify([appearanceKey, candidate?.id, scopedUrl, source, scope, gender]);
  const { model, loading, failed, retry } = useLocalPreview({
    owner,
    binding,
    url: entry && !entry.ready ? undefined : scopedUrl,
    source,
    scope,
    gender,
  });
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
  const display = useReferenceSkin(surface, gender, skin);
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
        {display.surface ? (
          <InteractivePose
            key={binding}
            surface={display.surface}
            viewKey={binding}
            large
            rotationOnly
            renderLayer={renderLayer}
            outlineWidth={outlineWidth}
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
        {failed && !surface && (
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
        {surface && (
          <p className="text-[11px] text-text-secondary">
            {gender === "female" ? "여성" : "남성"} 기본형 · 참고용 포즈
          </p>
        )}
        <CandidateAppearanceControls personIndex={person.index} />
        {surface && (display.pending || display.failed) && (
          <p role="status" className="text-[11px] text-text-secondary">
            {display.failed
              ? "스킨을 불러오지 못했어요. 다른 스킨을 선택해 주세요."
              : "스킨 불러오는 중…"}
          </p>
        )}
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
