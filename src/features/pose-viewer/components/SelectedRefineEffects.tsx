import type { SelectedRefineTarget } from "../api/selectedRefineTarget";
import { JOINT_LABELS } from "../lib/loadingGeometry";
import { ProgressSkeleton } from "./AnalysisProgressScene";

/** Effects stay on observed rough targets; no invented movement or mannequin coordinates. */
export function SelectedRefineEffects({ target }: { target: SelectedRefineTarget }) {
  return (
    <div className="pose-loading__selected-effects" data-refinement="running">
      <ProgressSkeleton
        skeleton={target.skeleton}
        ratio={target.width / target.height}
        highlighted={target.targetJoints}
        inputJoints={target.targetJoints}
        inputRunning
        polishing
      />
      <div className="pose-loading__joint-feed">
        <span>러프 위치</span>
        <span aria-hidden="true">→</span>
        <span>
          {target.targetJoints
            .slice(0, 2)
            .map((i) => JOINT_LABELS[i])
            .join(" · ")}
        </span>
      </div>
      <div className="pose-loading__joint-status">
        <span />
        보정 대상 관절
      </div>
    </div>
  );
}
