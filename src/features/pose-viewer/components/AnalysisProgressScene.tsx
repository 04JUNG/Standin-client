import { useEffect, useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import { useReducedLoadingMotion } from "../lib/useReducedLoadingMotion";
import { JOINT_LABELS, refinementJoints, type FocusBounds } from "../lib/loadingGeometry";
import { observedSceneFacts } from "../lib/loadingCopy";
import { apiFetchBlob } from "@/shared/api/client";
import type {
  AnalysisPersonProgress,
  AnalysisSnapshot,
  ProgressCandidate,
  SkeletonOverlay,
} from "../api/analysisProgress";
import type { PoseLoadingStage } from "../lib/loadingProgress";

const EDGES = [
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
] as const;

/** Both the image and overlay use contain/meet in this exact viewport. */
export function ProgressSkeleton({
  skeleton,
  before,
  ratio = 1,
  ghost = false,
  focus,
  sourceImage,
  highlighted = [],
  inputJoints = [],
  inputRunning = false,
  polishing = false,
}: {
  skeleton: SkeletonOverlay;
  before?: SkeletonOverlay;
  ratio?: number;
  ghost?: boolean;
  focus?: FocusBounds;
  sourceImage?: string;
  highlighted?: number[];
  inputJoints?: number[];
  inputRunning?: boolean;
  polishing?: boolean;
}) {
  const reduced = useReducedLoadingMotion();
  const height = 1000 / ratio;
  const unit = focus?.width ?? 1;
  const viewBox = focus
    ? `${focus.x * 1000} ${focus.y * height} ${focus.width * 1000} ${focus.height * height}`
    : `0 0 1000 ${height}`;
  const animate = (attributeName: string, from: number | undefined, to: number) =>
    !reduced && from !== undefined && from !== to ? (
      <animate attributeName={attributeName} from={from} to={to} dur="900ms" fill="freeze" />
    ) : null;
  return (
    <svg
      className={`pose-loading__skeleton ${ghost ? "pose-loading__skeleton--ghost" : ""}`}
      viewBox={viewBox}
      data-has-highlight={highlighted.length > 0}
      preserveAspectRatio="xMidYMid meet"
      role={ghost ? undefined : "img"}
      aria-label={ghost ? undefined : "분석된 주요 관절"}
      aria-hidden={ghost || undefined}
    >
      {sourceImage && (
        <image href={sourceImage} x="0" y="0" width="1000" height={height} opacity=".45" />
      )}
      {EDGES.map(([a, b]) => {
        const start = skeleton.points[a],
          end = skeleton.points[b];
        if (!start || !end) return null;
        const oldStart = before?.points[a],
          oldEnd = before?.points[b];
        return (
          <line
            key={`${a}-${b}`}
            data-edge={`${a}-${b}`}
            data-highlighted={highlighted.includes(a) || highlighted.includes(b)}
            x1={start[0] * 1000}
            y1={start[1] * height}
            x2={end[0] * 1000}
            y2={end[1] * height}
            vectorEffect="non-scaling-stroke"
          >
            {animate("x1", oldStart ? oldStart[0] * 1000 : undefined, start[0] * 1000)}
            {animate("y1", oldStart ? oldStart[1] * height : undefined, start[1] * height)}
            {animate("x2", oldEnd ? oldEnd[0] * 1000 : undefined, end[0] * 1000)}
            {animate("y2", oldEnd ? oldEnd[1] * height : undefined, end[1] * height)}
          </line>
        );
      })}
      {skeleton.points.map(
        (p, index) =>
          p &&
          index >= 5 && (
            <circle
              key={index}
              data-joint={index}
              data-highlighted={highlighted.includes(index)}
              cx={p[0] * 1000}
              cy={p[1] * height}
              r={9 * unit}
            >
              {animate(
                "cx",
                before?.points[index]?.[0] !== undefined
                  ? before.points[index]![0] * 1000
                  : undefined,
                p[0] * 1000,
              )}
              {animate(
                "cy",
                before?.points[index]?.[1] !== undefined
                  ? before.points[index]![1] * height
                  : undefined,
                p[1] * height,
              )}
            </circle>
          ),
      )}
      {highlighted.map((index) => {
        const p = skeleton.points[index];
        if (!p) return null;
        return (
          <circle
            key={`ring-${index}`}
            className="pose-loading__joint-ring"
            data-active-joint={index}
            cx={p[0] * 1000}
            cy={p[1] * height}
            r={21 * unit}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {polishing &&
        !reduced &&
        highlighted.slice(0, 4).map((index, order) => {
          const p = skeleton.points[index];
          if (!p) return null;
          return (
            <g key={`polish-${index}`} data-polish-joint={index} aria-hidden="true">
              {[
                [-29, -23],
                [30, 16],
              ].map(([dx, dy], i) => (
                <g
                  key={i}
                  transform={`translate(${p[0] * 1000 + dx * unit} ${p[1] * height + dy * unit}) scale(${unit})`}
                >
                  <path
                    className="pose-loading__joint-glint"
                    style={{ "--order": order * 2 + i } as CSSProperties}
                    d="M 0 -15 L 3 -3 L 15 0 L 3 3 L 0 15 L -3 3 L -15 0 L -3 -3 Z"
                  />
                </g>
              ))}
            </g>
          );
        })}
      {inputJoints.slice(0, 2).map((index, i) => {
        const p = skeleton.points[index];
        if (!p) return null;
        const x = p[0] * 1000,
          y = p[1] * height;
        const fromX = x + (i % 2 ? -105 : 105) * unit,
          fromY = y - (92 + i * 16) * unit;
        const path = `M ${fromX} ${fromY} Q ${x} ${fromY} ${x} ${y}`;
        return (
          <g key={`input-${index}`} className="pose-loading__joint-input" data-input-joint={index}>
            <path d={path} fill="none" vectorEffect="non-scaling-stroke" />
            {!reduced && (
              <circle r={5 * unit}>
                <animateMotion
                  path={path}
                  dur="1.6s"
                  repeatCount={inputRunning ? "indefinite" : "1"}
                  fill="freeze"
                />
              </circle>
            )}
            <rect
              x={fromX - 180 * unit}
              y={fromY - 70 * unit}
              width={360 * unit}
              height={74 * unit}
              rx={9 * unit}
            />
            <text x={fromX} y={fromY - 18 * unit} textAnchor="middle" fontSize={48 * unit}>
              {JOINT_LABELS[index]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Ready images only. Never starts model conversion/rendering or sends credentials off-origin. */
export function ProgressImage({ url, alt }: { url: string; alt: string }) {
  const [asset, setAsset] = useState<{ source: string; objectUrl: string }>();
  const [failed, setFailed] = useState<string>();
  const protectedImage = url.startsWith("/v1/");
  useEffect(() => {
    if (!protectedImage) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void apiFetchBlob(url, { auth: false, signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        if (!/^image\/(png|jpeg|webp)$/.test(blob.type) || blob.size > 2 * 1024 * 1024)
          throw Error("Unsupported progress image");
        objectUrl = URL.createObjectURL(blob);
        setAsset({ source: url, objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(url);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, protectedImage]);
  const src = protectedImage ? (asset?.source === url ? asset.objectUrl : undefined) : url;
  return src && failed !== url ? (
    <img
      src={src}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
    />
  ) : (
    <span className="pose-loading__image-placeholder" role="img" aria-label={`${alt} 준비 중`}>
      <ImageOff size={16} />
    </span>
  );
}

export function ProgressCandidates({
  candidates,
  ranking,
}: {
  candidates: ProgressCandidate[];
  ranking: boolean;
}) {
  const reduced = useReducedLoadingMotion();
  const [flowing, setFlowing] = useState(false);
  useEffect(() => {
    if (ranking || candidates.length < 2 || reduced) return;
    // Only starts the decorative ribbon after the fan. Never delays server data/results.
    const timer = window.setTimeout(() => setFlowing(true), 1650);
    return () => window.clearTimeout(timer);
  }, [ranking, candidates.length, reduced]);
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  return (
    <div
      className={`pose-loading__candidates ${ranking ? "pose-loading__candidates--ranked" : ""}`}
      aria-label={ranking ? "정리 중인 실제 포즈 후보" : "탐색 중인 실제 포즈 후보"}
      style={{ "--candidate-count": sorted.length } as CSSProperties}
      data-streaming={!ranking && sorted.length > 1}
      data-flowing={flowing && !ranking && !reduced}
    >
      <div className="pose-loading__reel-track">
        {sorted.map((candidate, i) => (
          <div
            className="pose-loading__candidate-slot"
            key={candidate.id}
            style={
              {
                "--order": i,
                "--offset": i - (sorted.length - 1) / 2,
                // Evenly fills the entire ribbon from the first frame: all real cards move together.
                "--phase": i - sorted.length + 0.5,
              } as CSSProperties
            }
          >
            <div className="pose-loading__candidate" data-candidate-id={candidate.id}>
              <span>{String(candidate.rank).padStart(2, "0")}</span>
              <ProgressImage url={candidate.thumbnailUrl} alt={`포즈 후보 ${candidate.rank}`} />
            </div>
          </div>
        ))}
      </div>
      {!ranking && sorted.length > 1 && (
        <>
          <span className="pose-loading__ribbon-scan" aria-hidden="true" />
          <span className="pose-loading__reel-window" aria-hidden="true">
            {sorted.map((candidate) => (
              <i key={candidate.id} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

export function AnalysisProgressScene({
  stage,
  person,
  ratio,
  focus,
  sourceImage,
  provisionalSkeleton,
}: {
  stage: PoseLoadingStage;
  person?: AnalysisPersonProgress;
  ratio: number;
  focus?: FocusBounds;
  sourceImage?: string;
  provisionalSkeleton?: SkeletonOverlay;
}) {
  const refinement = person?.refinement;
  const observedSkeleton = person?.skeleton ?? provisionalSkeleton;
  const actualFit = refinement?.status === "improved";
  if ((stage === "searching" || stage === "ranking") && person?.candidates?.length)
    return <ProgressCandidates candidates={person.candidates} ranking={stage === "ranking"} />;
  if (stage === "refining" && refinement) {
    const shown = actualFit ? (refinement.after ?? refinement.before) : refinement.before;
    const highlighted = refinementJoints(refinement);
    if (shown)
      return (
        <div
          className="pose-loading__rough-overlay"
          data-refinement={refinement.status}
          key={`${refinement.candidateId}:${refinement.status}`}
        >
          {actualFit && refinement.before && (
            <ProgressSkeleton skeleton={refinement.before} ratio={ratio} focus={focus} ghost />
          )}
          <ProgressSkeleton
            skeleton={shown}
            before={actualFit ? refinement.before : undefined}
            ratio={ratio}
            focus={focus}
            sourceImage={sourceImage}
            highlighted={highlighted}
            inputJoints={refinement.activeJoints ?? []}
            inputRunning={refinement.status === "running"}
            polishing={refinement.status === "running" || actualFit}
          />
          {(refinement.status === "running" || actualFit) && (
            <span className="pose-loading__polish-sheen" aria-hidden="true" />
          )}
          {!!refinement.activeJoints?.length && highlighted.length > 0 && (
            <span className="pose-loading__joint-feed">
              <span>러프 위치</span>
              <span aria-hidden="true">→</span>
              <span>
                {refinement.activeJoints
                  .slice(0, 2)
                  .map((index) => JOINT_LABELS[index]?.replace(/^(왼쪽|오른쪽) /, ""))
                  .join(" · ")}
              </span>
            </span>
          )}
          {highlighted.length > 0 && (
            <span className="pose-loading__joint-status">
              <span />
              {refinement.status === "running" ? "러프 관절 정보 반영 중" : "바뀐 관절 위치"}
            </span>
          )}
        </div>
      );
    if (refinement.beforeThumbnailUrl || (actualFit && refinement.afterThumbnailUrl))
      return (
        <div
          className="pose-loading__refine-images"
          data-refinement={refinement.status}
          key={`${refinement.candidateId}:${refinement.status}`}
        >
          {refinement.beforeThumbnailUrl && (
            <ProgressImage url={refinement.beforeThumbnailUrl} alt="조정 전 실제 포즈" />
          )}
          {actualFit && refinement.afterThumbnailUrl && (
            <div className="pose-loading__refine-after">
              <ProgressImage url={refinement.afterThumbnailUrl} alt="조정 후 실제 포즈" />
            </div>
          )}
          {(refinement.status === "running" || actualFit) && (
            <span className="pose-loading__polish-sheen" aria-hidden="true" />
          )}
        </div>
      );
  }
  return (
    <>
      {stage !== "analyzing" && observedSkeleton && (
        <div className="pose-loading__rough-overlay">
          <ProgressSkeleton
            skeleton={observedSkeleton}
            ratio={ratio}
            focus={focus}
            sourceImage={sourceImage}
          />
        </div>
      )}
      {(stage === "analyzing" || !observedSkeleton) && (
        <div className="pose-loading__scan" aria-hidden="true" />
      )}
    </>
  );
}

export function ObservedKeywords({
  observations = [],
  scene,
  intoThumbnail = false,
}: {
  observations?: AnalysisPersonProgress["observations"];
  scene?: AnalysisSnapshot["scene"];
  intoThumbnail?: boolean;
}) {
  const facts = observedSceneFacts(scene);
  const keywords = [
    ...facts.map((fact) => ({ id: `scene:${fact.id}`, label: fact.label })),
    ...observations,
  ];
  const entries = [
    [-25, -24],
    [23, -13],
    [-22, 19],
    [20, 25],
    [0, -30],
  ];
  return (
    <div
      className="pose-loading__observation-flow"
      data-thumbnail={intoThumbnail}
      aria-hidden="true"
    >
      <div className="pose-loading__observations">
        {keywords.map((tag, i) => (
          <span
            key={`${tag.id}:${tag.label}`}
            data-observation-id={tag.id}
            style={
              {
                "--order": i,
                "--entry-x": `${entries[i % entries.length][0]}cqw`,
                "--entry-y": `${entries[i % entries.length][1]}cqw`,
              } as CSSProperties
            }
          >
            {tag.label}
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}
