import { SELECTED_REFINE_COPY, type SelectedRefineProgress } from "../lib/selectedRefineProgress";
export function SelectedRefineStatus({ progress = [] }: { progress?: SelectedRefineProgress[] }) {
  if (!progress.length) return null;
  return (
    <ul aria-label="선택한 포즈의 보정 상태" className="text-[12px] text-text-secondary">
      {progress.map((entry) => (
        <li key={entry.personIndex} role="status">
          인물 {entry.personIndex + 1} · {SELECTED_REFINE_COPY[entry.status]}
        </li>
      ))}
    </ul>
  );
}
