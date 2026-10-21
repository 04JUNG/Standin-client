import { useQuery } from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import { loadBasicCloseup } from "../api/basicCloseup";
import type { PosePresentation } from "../api/posePresentation";

export function BasicCloseupReference({
  presentation: p,
  compact = false,
}: {
  presentation: PosePresentation;
  compact?: boolean;
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const q = useQuery({
    queryKey: ["basic-closeup-reference", owner, p.output_scope, p.basic_model],
    enabled: !!owner,
    queryFn: ({ signal }) => loadBasicCloseup(p, signal),
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  });
  return (
    <section
      aria-label="기본 클로즈업 참고"
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <h3 className="text-xs font-semibold">
        {p.output_scope === "head"
          ? "두상"
          : p.output_scope === "shoulder_head"
            ? "어깨~머리"
            : "클로즈업"}{" "}
        기본 모델 참고
      </h3>
      {q.data ? (
        <img
          src={q.data}
          alt="기본 체형의 클로즈업 참고 모델"
          className={
            compact ? "h-[160px] w-full object-contain" : "max-h-[320px] w-full object-contain"
          }
        />
      ) : (
        <div role="status" className="text-xs text-text-secondary">
          {q.error || !owner
            ? "기본 모델 미리보기를 불러오지 못했어요."
            : "기본 모델 미리보기 준비 중…"}
          {(q.error || !owner) && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void q.refetch()}
              disabled={!owner}
            >
              다시 시도
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-text-secondary">
        기본 체형 · 중립 자세 참고예요. 러프의 고개 방향·기울기를 맞춘 결과는 아니에요.
      </p>
      <p className="text-xs text-text-secondary">미리보기 전용 · 포즈 선택·저장 대상은 아니에요.</p>
    </section>
  );
}
