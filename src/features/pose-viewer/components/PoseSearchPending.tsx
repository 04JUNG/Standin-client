import { useEffect, useState } from "react";
import { Check, ImageOff, Loader2, Minus } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { UploadDraft } from "@/shared/types/upload";
import { activeProgressPerson } from "../api/analysisProgress";
import { skeletonFocus } from "../lib/loadingGeometry";
import {
  estimateLoadingProgress,
  loadingVisualStage,
  POSE_LOADING_STAGES,
  LOADING_STAGE_LABELS,
  type AnalysisProgress,
  type LoadingPhase,
} from "../lib/loadingProgress";
import { AnalysisProgressScene, ObservedKeywords } from "./AnalysisProgressScene";
import {
  SEARCH_MODE_COPY,
  REFINE_COPY,
  REFINE_DETAIL,
  observedSceneFacts,
} from "../lib/loadingCopy";
import "./PoseSearchPending.css";

type Props = {
  preview?: Pick<UploadDraft, "previewUrl" | "originalName"> | null;
  compact?: boolean;
  restoring?: boolean;
  mode?: "search" | "refine";
  progress?: AnalysisProgress | null;
  selectionPreviewUrl?: string;
  /** Only set by the successful-result boundary, never an elapsed-time estimate. */
  completed?: boolean;
};
const COPY: Record<Exclude<LoadingPhase, "ranking" | "preparing">, [string, string]> = {
  uploading: ["러프를 보내고 있어요", "그림을 전달한 뒤 가까운 포즈를 찾아요."],
  queued: ["분석 순서를 기다리고 있어요", "러프가 도착했어요. 잠시만 기다려 주세요."],
  running: ["가까운 포즈를 찾고 있어요", "러프의 자세를 분석하고 포즈를 비교하고 있어요."],
  analyzing: ["러프를 살펴보고 있어요", "그림 속 인물과 장면의 구성을 확인해요."],
  extracting: ["자세의 흐름을 읽고 있어요", "확인된 주요 관절을 러프 위에 연결해요."],
  understanding: ["동작의 특징을 읽고 있어요", "그림에서 읽은 자세와 동작을 살펴봐요."],
  searching: ["가까운 포즈를 찾고 있어요", "준비된 포즈부터 차례로 비교해요."],
  refining: ["러프에 맞춰 조정하고 있어요", "조정 결과가 준비되면 변화를 보여드려요."],
};

/** Every observation belongs to this Job. Only server milestones change scenes. */
export function PoseSearchPending({
  preview,
  compact = false,
  restoring = false,
  mode = "search",
  progress,
  selectionPreviewUrl,
  completed = false,
}: Props) {
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ url: string; ratio: number }>();
  const [mountedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (restoring || completed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(timer);
  }, [restoring, completed]);
  const refining = mode === "refine";
  const snapshot = refining ? undefined : progress?.snapshot;
  const phase: LoadingPhase = refining
    ? "refining"
    : (snapshot?.stage ?? progress?.phase ?? "running");
  const finishingSearch = phase === "ranking" || phase === "preparing";
  const stage = completed && phase !== "refining" ? "searching" : loadingVisualStage(phase);
  const copy = COPY[finishingSearch ? "searching" : phase];
  const evidence =
    stage === "extracting"
      ? "skeleton"
      : stage === "understanding"
        ? "observations"
        : stage === "refining"
          ? "refinement"
          : stage === "searching"
            ? "candidates"
            : undefined;
  const person = activeProgressPerson(snapshot, evidence);
  const provisional =
    !snapshot?.people.length &&
    (stage === "extracting" || stage === "understanding" || stage === "searching")
      ? snapshot?.focus
      : undefined;
  const observations = person?.observations ?? provisional?.observations;
  const sceneFacts = observedSceneFacts(snapshot?.scene);
  const showUnderstanding = stage === "understanding" || stage === "searching";
  const searchMode = person?.searchMode ?? provisional?.searchMode;
  const multi = (snapshot?.people.length ?? 0) > 1;
  const focus = provisional
    ? skeletonFocus(provisional.skeleton)
    : multi && (stage === "extracting" || stage === "understanding")
      ? skeletonFocus(person?.skeleton)
      : multi && stage === "refining"
        ? skeletonFocus(person?.refinement?.before, person?.refinement?.after)
        : undefined;
  const current = POSE_LOADING_STAGES.indexOf(stage);
  const percent = completed
    ? 100
    : Math.max(
        progress?.estimateFloor ?? 0,
        estimateLoadingProgress(phase, now - (progress?.enteredAt ?? mountedAt)),
      );
  const imageUrl = refining ? selectionPreviewUrl || preview?.previewUrl : preview?.previewUrl;
  const showImage = imageUrl && imageUrl !== failedPreviewUrl;
  const ratio = imageSize && imageSize.url === imageUrl ? imageSize.ratio : 1;
  const title = completed
    ? "분석이 끝났어요"
    : restoring
      ? "이전 분석 결과를 불러오고 있어요"
      : stage === "refining" && person?.refinement
        ? REFINE_COPY[person.refinement.status]
        : copy[0];
  const detail = completed
    ? "결과를 살펴보세요."
    : restoring
      ? "저장된 결과를 확인하고 있어요."
      : stage === "refining" && person?.refinement
        ? REFINE_DETAIL[person.refinement.status]
        : (stage === "understanding" || stage === "searching") && searchMode
          ? SEARCH_MODE_COPY[searchMode]
          : copy[1];
  const hasCandidates = stage === "searching" && !!person?.candidates?.length;
  const hasRefineImage =
    stage === "refining" &&
    !person?.refinement?.before &&
    !person?.refinement?.after &&
    !!(
      person?.refinement?.beforeThumbnailUrl ||
      (person?.refinement?.status === "improved" && person.refinement.afterThumbnailUrl)
    );
  const shrinkSource = hasCandidates || hasRefineImage;
  const legacy = !snapshot && !refining;

  return (
    <section
      className={cn(
        "pose-loading",
        compact && "pose-loading--compact",
        restoring && "pose-loading--restoring",
      )}
      data-stage={stage}
      data-phase={phase}
      data-synchronized={!!snapshot}
      data-completed={completed}
      data-focused-person={person?.personIndex}
      data-focus-id={provisional?.id}
      aria-label={refining ? "포즈 조정 진행" : "포즈 검색 진행"}
      aria-busy={!completed}
    >
      {!restoring && (
        <figure className="pose-loading__figure">
          <div
            className="pose-loading__visual"
            data-source-small={shrinkSource}
            data-focused={!!focus && !!showImage}
          >
            <div className="pose-loading__scene-number" aria-hidden="true">
              {String(current + 1).padStart(2, "0")}
              <span> / {String(POSE_LOADING_STAGES.length).padStart(2, "0")}</span>
            </div>
            {person && snapshot && snapshot.people.length > 1 && (
              <span className="pose-loading__person-badge">
                인물 {person.personIndex + 1}
                <span> / {snapshot.people.length}</span>
              </span>
            )}
            {provisional && <span className="pose-loading__person-badge">인물 분석 중</span>}
            <div className="pose-loading__source">
              {showImage ? (
                <img
                  src={imageUrl}
                  alt={refining && selectionPreviewUrl ? "조정 중인 선택 포즈" : "검색 중인 러프"}
                  decoding="async"
                  onError={() => setFailedPreviewUrl(imageUrl)}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalWidth > 0 && image.naturalHeight > 0)
                      setImageSize({
                        url: imageUrl,
                        ratio: image.naturalWidth / image.naturalHeight,
                      });
                  }}
                />
              ) : (
                <div className="pose-loading__missing">
                  <ImageOff size={20} aria-hidden="true" />
                  <span>미리보기를 표시할 수 없어요.</span>
                  <span>{refining ? "포즈 조정" : "포즈 검색"}은 계속 진행됩니다.</span>
                </div>
              )}
            </div>
            <div
              className="pose-loading__artwork"
              key={`${stage}:${person?.personIndex ?? "pending"}`}
            >
              <AnalysisProgressScene
                stage={stage}
                finishingSearch={finishingSearch || completed}
                person={person}
                ratio={ratio}
                focus={showImage ? focus : undefined}
                sourceImage={focus && showImage ? imageUrl : undefined}
                provisionalSkeleton={provisional?.skeleton}
              />
            </div>
            {showUnderstanding && (!!observations?.length || sceneFacts.length > 0) && (
              <ObservedKeywords
                key={person?.personIndex ?? provisional?.id ?? "cut"}
                observations={observations}
                scene={snapshot?.scene}
                intoThumbnail={hasCandidates}
              />
            )}
            <div className="pose-loading__visual-caption">
              <span>{LOADING_STAGE_LABELS[stage]}</span>
              <span>{snapshot ? "분석 정보" : "처리 중"}</span>
            </div>
          </div>
          <figcaption title={preview?.originalName}>
            {refining && selectionPreviewUrl ? "선택한 포즈" : "검색 중인 러프"}
            {preview?.originalName && <span> · {preview.originalName}</span>}
          </figcaption>
          {(stage === "understanding" || stage === "searching") && observations?.length ? (
            <p className="pose-loading__observed-summary">
              {observations.map((tag) => tag.label).join(" · ")}
            </p>
          ) : null}
        </figure>
      )}
      <div className="pose-loading__info">
        <div className="pose-loading__eyebrow">
          STANDIN <span>/ POSE SEARCH</span>
        </div>
        <div className="pose-loading__heading">
          <h2 key={title}>{title}</h2>
          {!restoring && (
            <span className="pose-loading__percent" aria-hidden="true">
              {percent}
              <small>%</small>
            </span>
          )}
        </div>
        <p role="status" className="pose-loading__detail">
          {completed ? <Check aria-hidden="true" /> : <Loader2 aria-hidden="true" />}
          {detail}
        </p>
        {showUnderstanding && sceneFacts.length > 0 && (
          <dl className="pose-loading__scene-facts" aria-label="그림에서 읽은 컷 정보">
            {sceneFacts.map((fact) => (
              <div key={fact.id}>
                <dt>{fact.category}</dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
          </dl>
        )}
        <div
          className="pose-loading__track"
          role="progressbar"
          aria-label={
            completed ? "분석 완료" : restoring ? "저장된 결과 불러오는 중" : "예상 진행률"
          }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={restoring ? undefined : percent}
          aria-valuetext={
            completed
              ? "분석 완료 100%"
              : restoring
                ? undefined
                : `예상 ${percent}%. 실제 완료까지 걸리는 시간은 달라질 수 있어요.`
          }
        >
          <div
            className="pose-loading__fill"
            style={restoring ? undefined : { width: `${percent}%` }}
          />
        </div>
        <div className="pose-loading__footnote">
          {completed
            ? "분석 완료 · 결과로 이어져요"
            : restoring
              ? "잠시만 기다려 주세요."
              : "예상 진행률 · 준비되면 바로 표시돼요"}
        </div>
        {!restoring && (
          <ol className="pose-loading__steps" aria-label="작업 단계">
            {POSE_LOADING_STAGES.map((value, i) => {
              const completionStage = value === "searching" && finishingSearch ? "ranking" : value;
              const skipped = snapshot?.skippedStages.includes(value) ?? false;
              const complete =
                !skipped &&
                ((snapshot?.completedStages.includes(completionStage) ?? false) ||
                  (completed && value === stage));
              const active =
                !completed &&
                !complete &&
                !skipped &&
                i === current &&
                (!legacy || phase !== "running");
              return (
                <li
                  key={value}
                  aria-current={active ? "step" : undefined}
                  data-complete={complete}
                  data-skipped={skipped}
                  title={
                    skipped ? `${LOADING_STAGE_LABELS[value]} · 생략` : LOADING_STAGE_LABELS[value]
                  }
                >
                  <span className="pose-loading__step-marker">
                    {skipped ? (
                      <Minus size={10} />
                    ) : complete ? (
                      <Check size={10} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="pose-loading__step-name">
                    {LOADING_STAGE_LABELS[value]}
                    {skipped && <span className="sr-only"> 생략</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
