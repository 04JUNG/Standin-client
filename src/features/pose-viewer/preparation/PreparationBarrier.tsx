import { Button } from "@/shared/components/Button";
import type { CandidatePreparation } from "./useCandidatePreparation";
export function PreparationBarrier({
  preparation,
  onLeave,
}: {
  preparation: CandidatePreparation;
  onLeave(): void;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 p-6 text-center">
      <p role={preparation.failed ? "alert" : "status"} className="text-sm text-text-primary">
        {preparation.failed
          ? "포즈를 준비하지 못했어요. 다시 시도해 주세요."
          : "러프에 맞춰 포즈 후보를 준비하고 있어요…"}
      </p>
      {!preparation.failed && preparation.progress && (
        <p className="text-xs text-text-secondary">준비된 후보 {preparation.progress}</p>
      )}
      <p className="text-xs text-text-secondary">모든 후보의 준비가 끝나면 비교할 수 있어요.</p>
      <div className="flex gap-2">
        {preparation.failed && <Button onClick={preparation.retry}>다시 시도</Button>}
        <Button
          variant="secondary"
          onClick={() => {
            preparation.cancel();
            onLeave();
          }}
        >
          돌아가기
        </Button>
      </div>
    </div>
  );
}

export function PreparationNotice({ preparation }: { preparation: CandidatePreparation }) {
  const failed =
    preparation.batch?.candidates.filter((c) => c.status === "failed_retryable").length ?? 0;
  if (!failed) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg border border-brand-coral/30 bg-surface-0 p-3 text-xs text-text-secondary"
    >
      <span>
        포즈 {failed}개를 준비하지 못했어요. 다른 후보를 고르거나 잠시 후 다시 시도해 주세요.
      </span>
      <button className="shrink-0 underline" onClick={preparation.retry}>
        다시 준비
      </button>
    </div>
  );
}
