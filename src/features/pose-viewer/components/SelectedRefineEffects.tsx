import { Sparkles } from "lucide-react";
import { useReducedLoadingMotion } from "../lib/useReducedLoadingMotion";

/** Processing decoration, not joint positions or evidence that a pose improved. */
export function SelectedRefineEffects() {
  const reduced = useReducedLoadingMotion();
  return (
    <div className="pose-loading__selected-effects" aria-hidden="true">
      <span className="pose-loading__selected-halo" />
      {!reduced && (
        <>
          <span className="pose-loading__polish-sheen" />
          <Sparkles className="pose-loading__selected-glint pose-loading__selected-glint--start" />
          <Sparkles className="pose-loading__selected-glint pose-loading__selected-glint--end" />
        </>
      )}
    </div>
  );
}
