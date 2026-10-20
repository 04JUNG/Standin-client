import { invalidateFinalReview } from "@/features/export/lib/invalidateFinalReview";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AnalysisResult, PersonResult } from "../api/pose.contract";
import {
  readOutputScope,
  saveOutputScope,
  SCOPE_LABELS,
  scopeSelectionSchema,
} from "../api/outputScope";
import { poseQueryKeys } from "../queryKeys";

/** A server-owned preference, independent of candidate/refine selection state. */
export function OutputScopeSelect({
  jobId,
  person,
  enabled,
  cropping = false,
}: {
  jobId: string;
  person: PersonResult;
  enabled: boolean;
  cropping?: boolean;
}) {
  const queryClient = useQueryClient();
  const scope = readOutputScope(person.outputScope);
  const mutation = useMutation({
    mutationKey: ["output-scope", jobId],
    mutationFn: (selection: "auto" | keyof typeof SCOPE_LABELS) =>
      saveOutputScope(jobId, person.index, selection, scope),
    onSuccess: (outputScope) => {
      invalidateFinalReview(queryClient, jobId);
      // Both live and history keys can point to this same server job.
      queryClient.setQueriesData<AnalysisResult>({ queryKey: poseQueryKeys.all }, (previous) =>
        previous?.jobId === jobId
          ? {
              ...previous,
              people: previous.people.map((item) =>
                item.index === person.index
                  ? {
                      ...item,
                      outputScope,
                      candidates: item.candidates.map((c) => ({
                        ...c,
                        posterScope: outputScope.resolved,
                      })),
                      posePresentation: item.posePresentation
                        ? { ...item.posePresentation, output_scope: outputScope.resolved }
                        : undefined,
                    }
                  : item,
              ),
            }
          : previous,
      );
    },
  });
  if (!enabled) return null;
  const id = `output-scope-${person.index}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-1 px-3 py-2 text-[12px]">
      <label htmlFor={id} className="font-semibold text-text-primary">
        저장할 부분
      </label>
      <select
        id={id}
        aria-label={`인물 ${person.index + 1}에서 저장할 부분`}
        value={scope.selection}
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate(scopeSelectionSchema.parse(event.target.value))}
        className="min-h-11 rounded-md border border-border bg-surface-0 px-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-sky disabled:opacity-50"
      >
        <option value="auto">
          자동 ({scope.detected ? SCOPE_LABELS[scope.detected] : "전체 모습"})
        </option>
        {Object.entries(SCOPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <span role="status" className="text-text-secondary">
        {mutation.isPending
          ? "저장 중…"
          : `${SCOPE_LABELS[scope.resolved]}${scope.resolutionSource === "user" ? " · 내가 고른 범위" : ""}`}
      </span>
      <span className="basis-full text-text-secondary">
        {cropping
          ? "미리보기와 FBX에 선택한 부분이 보여요. BVH에는 전체 동작이 저장돼요."
          : "선택은 기억해 둘게요. 지금은 미리보기와 파일에 전체 모습이 나와요."}
      </span>
      {mutation.isError && (
        <p role="alert" className="basis-full text-brand-coral">
          저장하지 못했습니다. 범위를 다시 선택해 주세요.
        </p>
      )}
    </div>
  );
}
