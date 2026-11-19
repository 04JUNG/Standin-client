import { useEffect, useState, type CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RefreshCw, Moon, Sun, Check, AlertTriangle, Play, Pause } from "lucide-react";
import { AnalysisResultsTransition } from "@/features/pose-viewer/components/AnalysisResultsTransition";
import { PoseSearchPending } from "@/features/pose-viewer/components/PoseSearchPending";
import { exampleSnapshot, previewCandidates } from "./analysis-progress-fixture";
import { readAnalysisProgress } from "@/features/pose-viewer/api/analysisProgress";
import { ProgressImage } from "@/features/pose-viewer/components/AnalysisProgressScene";
import {
  POSE_LOADING_STAGES,
  LOADING_STAGE_LABELS,
  type AnalysisProgress,
  type PoseLoadingStage,
} from "@/features/pose-viewer/lib/loadingProgress";
import { Button } from "@/shared/components/Button";
import "@/app/styles/index.css";
import "./pose-loading-preview.css";
import rough from "./loading-rough.svg";
import multiRough from "./loading-multi-rough.svg";

type Scene = "search" | "restore" | "done" | "error" | "refine";
const DURATIONS = [2400, 4000, 6100, 7600, 5900];

export function Preview() {
  const [scene, setScene] = useState<Scene>("search");
  const [run, setRun] = useState(0);
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [partial, setPartial] = useState(false);
  const [multi, setMulti] = useState(false);
  const [outcome, setOutcome] = useState<
    "improved" | "running" | "unchanged" | "reverted" | "skipped"
  >("improved");
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState<AnalysisProgress>({
    phase: "analyzing",
    enteredAt: Date.now(),
  });
  const index = POSE_LOADING_STAGES.findIndex((value) => value === progress.phase);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (scene !== "search" || !playing) return;
    const timer = window.setTimeout(() => {
      if (index < POSE_LOADING_STAGES.length - 1) {
        const next = POSE_LOADING_STAGES[index + 1];
        setProgress({ phase: next, enteredAt: Date.now() });
      } else {
        setScene("done");
        setPlaying(false);
      }
    }, DURATIONS[index]);
    return () => window.clearTimeout(timer);
  }, [scene, playing, index, run, outcome]);
  const restart = () => {
    setProgress({ phase: "analyzing", enteredAt: Date.now() });
    setScene("search");
    setPlaying(true);
    setRun((value) => value + 1);
  };
  const chooseStage = (phase: PoseLoadingStage) => {
    setScene("search");
    setProgress({ phase, enteredAt: Date.now() });
    setPlaying(false);
  };
  const [localImage, setLocalImage] = useState<string>();
  useEffect(
    () => () => {
      if (localImage) URL.revokeObjectURL(localImage);
    },
    [localImage],
  );
  const snapshot = readAnalysisProgress(
    exampleSnapshot(progress.phase as PoseLoadingStage, {
      partial,
      multi,
      unassigned: multi && index === 1,

      sequence: index + 1,
    }),
  );
  const displayedProgress: AnalysisProgress = legacy
    ? { phase: "running", enteredAt: progress.enteredAt }
    : { ...progress, snapshot };
  const preview = {
    previewUrl: localImage || (multi ? multiRough : rough),
    originalName: "러프 미리보기.png",
  };
  return (
    <div className="loading-preview">
      <header className="loading-preview__header">
        <div>
          <span className="loading-preview__brand">
            Standin<span>.</span>
          </span>
          <span className="loading-preview__badge">분석 정보 미리보기</span>
        </div>
        <button
          type="button"
          onClick={() => setDark(!dark)}
          aria-label={dark ? "라이트 모드" : "다크 모드"}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>
      <main className="loading-preview__main">
        <div className="loading-preview__intro">
          <span>SEARCH → TOP5 → SELECT → REFINE → READY</span>
          <h1>러프에서 포즈까지.</h1>
          <p>
            예시 데이터로 검색 1~5와 선택 후 번호 없는 독립 자동 보정 UI를 확인해요. 실제 서버
            분석과 연결된 화면은 아닙니다.
          </p>
        </div>
        <div className="loading-preview__timeline" aria-label="로딩 구간 미리보기">
          {POSE_LOADING_STAGES.map((phase, i) => (
            <button
              type="button"
              key={phase}
              aria-pressed={scene === "search" && progress.phase === phase}
              onClick={() => chooseStage(phase)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {LOADING_STAGE_LABELS[phase]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setScene("refine");
              setOutcome("running");
              setPlaying(false);
            }}
          >
            선택 후 러프 맞춤
          </button>
        </div>
        <div
          className={`loading-preview__window ${compact ? "loading-preview__window--compact" : ""}`}
        >
          <div className="loading-preview__window-title">
            <span>
              <span className="loading-preview__window-dot" />
              포즈 검색
            </span>
            <span>
              {scene === "search"
                ? `${String(index + 1).padStart(2, "0")} / ${String(POSE_LOADING_STAGES.length).padStart(2, "0")}`
                : scene === "done"
                  ? "준비 완료"
                  : "미리보기"}
            </span>
          </div>
          <div className="loading-preview__stage">
            {scene === "refine" ? (
              <PoseSearchPending
                mode="refine"
                compact={compact}
                preview={preview}
                selectionPreviewUrl={previewCandidates[selected].thumbnailUrl}
                refinement={{
                  jobId: "fixture",
                  personIndex: 0,
                  candidateId: previewCandidates[selected].id,
                  status: outcome === "running" ? "refining" : outcome,
                  enteredAt: Date.now(),
                }}
              />
            ) : (
              <AnalysisResultsTransition
                jobKey={`preview-${run}`}
                pending={scene === "search" || scene === "restore"}
                ready={scene === "done"}
                enabled={scene !== "restore"}
                compact={compact}
                progress={displayedProgress}
                renderPending={(completed, capturedProgress) => (
                  <PoseSearchPending
                    preview={preview}
                    compact={compact}
                    completed={completed}
                    restoring={scene === "restore"}
                    progress={
                      localImage
                        ? { phase: "running", enteredAt: progress.enteredAt }
                        : capturedProgress
                    }
                  />
                )}
              >
                {scene === "done" ? (
                  <div className="loading-preview__results">
                    <span>
                      <Check size={16} />
                      가까운 포즈 후보가 준비됐어요
                    </span>
                    <div>
                      {previewCandidates.map((candidate, i) => (
                        <button
                          type="button"
                          key={`${run}-${i}`}
                          aria-pressed={selected === i}
                          onClick={() => {
                            setSelected(i);
                            setScene("refine");
                            setPlaying(false);
                          }}
                          className="pose-candidate-arrival"
                          style={{ "--candidate-order": i } as CSSProperties}
                        >
                          <ProgressImage url={candidate.thumbnailUrl} alt={`예시 후보 ${i + 1}`} />
                          <span>후보 {i + 1}</span>
                        </button>
                      ))}
                    </div>
                    <small>모션 확인용 예시 · 실제 검색 결과가 아닙니다.</small>
                  </div>
                ) : scene === "error" ? (
                  <div className="loading-preview__error" role="alert">
                    <AlertTriangle size={24} />
                    <h2>포즈를 찾지 못했어요</h2>
                    <p>오류가 발생하면 모션을 멈추고 다시 시도할 수 있어요.</p>
                    <Button onClick={restart}>다시 시도</Button>
                  </div>
                ) : null}
              </AnalysisResultsTransition>
            )}
          </div>
          <div className="loading-preview__window-footer">
            <span>예시 데이터 재생 · API 호출 없음</span>
            <button
              type="button"
              onClick={() => {
                if (scene !== "search") restart();
                else setPlaying(!playing);
              }}
            >
              {playing && scene === "search" ? <Pause size={12} /> : <Play size={12} />}{" "}
              {playing && scene === "search"
                ? "자동 전환 중"
                : scene === "search"
                  ? "이어 재생"
                  : "전체 재생"}
            </button>
            <button type="button" onClick={restart} aria-label="처음부터 재생">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
        <div className="loading-preview__controls">
          <button
            type="button"
            onClick={() => {
              setScene("done");
              setPlaying(false);
            }}
          >
            완료 전환 보기
          </button>
          <label>
            <input type="checkbox" checked={legacy} onChange={(e) => setLegacy(e.target.checked)} />
            구 서버 응답
          </label>
          <label>
            <input
              type="checkbox"
              checked={partial}
              onChange={(e) => setPartial(e.target.checked)}
            />
            부분 관절
          </label>
          <label>
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
            여러 인물
          </label>
          <label>
            조정 결과{" "}
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value as typeof outcome);
              }}
            >
              <option value="improved">조정됨</option>
              <option value="running">진행 중</option>
              <option value="unchanged">원본 유지</option>
              <option value="reverted">비교 후 복구</option>
              <option value="skipped">생략</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={compact}
              onChange={(event) => setCompact(event.target.checked)}
            />
            360px 플로팅 바
          </label>
          <label className="loading-preview__upload">
            내 러프로 보기
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setLocalImage(URL.createObjectURL(file));
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setScene("restore");
              setPlaying(false);
            }}
          >
            기록 불러오기
          </button>
          <button
            type="button"
            onClick={() => {
              setScene("error");
              setPlaying(false);
            }}
          >
            오류 보기
          </button>
        </div>
      </main>
    </div>
  );
}

if (import.meta.env.DEV) {
  const renderer =
    (import.meta.hot?.data.previewRoot as Root | undefined) ??
    createRoot(document.getElementById("root")!);
  if (import.meta.hot) import.meta.hot.data.previewRoot = renderer;
  renderer.render(<Preview />);
}
