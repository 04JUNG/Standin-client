import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AnalysisProgress } from "../lib/loadingProgress";
import { useReducedLoadingMotion } from "../lib/useReducedLoadingMotion";
import "./AnalysisResultsTransition.css";

type Props = {
  jobKey: string;
  pending: boolean;
  ready: boolean;
  enabled?: boolean;
  compact?: boolean;
  fill?: boolean;
  progress?: AnalysisProgress | null;
  renderPending: (completed: boolean, progress?: AnalysisProgress | null) => ReactNode;
  children?: ReactNode;
};

/** Results mount immediately. The noninteractive handoff only animates opacity/transform. */
export function AnalysisResultsTransition({
  jobKey,
  pending,
  ready,
  enabled = true,
  compact,
  fill,
  progress,
  renderPending,
  children,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const lastPending = useRef<{ key: string; progress?: AnalysisProgress | null; height: number }>();
  const [finished, setFinished] = useState<string>();
  const reduced = useReducedLoadingMotion();
  useLayoutEffect(() => {
    if (!pending) return;
    const previous = lastPending.current?.key === jobKey ? lastPending.current : undefined;
    lastPending.current = {
      key: jobKey,
      height: root.current?.getBoundingClientRect().height ?? 0,
      progress: progress?.snapshot
        ? progress
        : previous?.progress?.snapshot
          ? previous.progress
          : progress,
    };
    if (finished === jobKey) setFinished(undefined);
  }, [jobKey, pending, progress, finished]);
  const entering = !!(
    enabled &&
    !reduced &&
    !pending &&
    ready &&
    lastPending.current?.key === jobKey &&
    finished !== jobKey
  );
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setFinished(jobKey), 820);
    return () => window.clearTimeout(timer);
  }, [entering, jobKey]);
  return (
    <div
      ref={root}
      data-pending={pending}
      className={`analysis-transition ${entering ? "analysis-transition--entering" : ""} ${compact ? "analysis-transition--compact" : ""} ${fill ? "analysis-transition--fill" : ""}`}
      style={
        entering && lastPending.current?.height
          ? { minHeight: lastPending.current.height }
          : undefined
      }
    >
      {pending ? (
        renderPending(false, progress)
      ) : (
        <div className="analysis-transition__result">{children}</div>
      )}
      {entering && (
        <div
          className="analysis-transition__outgoing"
          aria-hidden="true"
          style={lastPending.current?.height ? { height: lastPending.current.height } : undefined}
        >
          {renderPending(true, lastPending.current?.progress)}
        </div>
      )}
    </div>
  );
}
