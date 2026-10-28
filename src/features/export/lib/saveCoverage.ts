import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { canRelease } from "@/features/pose-viewer/api/routedSearch";

export type OmittedPerson = {
  personIndex: number;
  reason: "no_candidate" | "validation_failed" | "user_excluded" | "not_selected";
};
export function saveCoverage(
  analysis: AnalysisResult | undefined,
  picks: Record<number, string>,
  excluded: Record<number, string | null>,
) {
  const included =
    analysis?.people
      .filter(
        (p) =>
          !(p.index in excluded) && canRelease(p.candidates.find((c) => c.id === picks[p.index])),
      )
      .map((p) => p.index) ?? [];
  const omitted: OmittedPerson[] =
    analysis?.people
      .filter((p) => !included.includes(p.index))
      .map((p) => ({
        personIndex: p.index,
        reason:
          p.index in excluded
            ? "user_excluded"
            : p.candidates.length === 0
              ? "no_candidate"
              : !p.candidates.some(canRelease)
                ? "validation_failed"
                : "not_selected",
      })) ?? [];
  return { detected: analysis?.people.map((p) => p.index) ?? [], included, omitted };
}
export type SaveCoverage = ReturnType<typeof saveCoverage>;
export const omissionLabel: Record<OmittedPerson["reason"], string> = {
  no_candidate: "후보 없음",
  validation_failed: "저장할 수 있는 후보 없음",
  user_excluded: "직접 제외",
  not_selected: "선택 안 함",
};
export function sceneUnavailableMessage(reason?: string) {
  switch (reason) {
    case "feature_disabled":
      return "이 작업에서는 통합 저장이 꺼져 있어요.";
    case "observation_missing":
    case "source_metadata_missing":
      return "러프의 배치 정보를 확인할 수 없어요.";
    case "receipt_storage_unavailable":
      return "구도 정보를 보관할 수 없어요. 잠시 후 다시 확인해 주세요.";
    case "converter_unavailable":
      return "통합 파일을 준비할 수 없어요. 잠시 후 다시 확인해 주세요.";
    case "selected_artifact_unsupported":
    case "generation_unapproved":
    case "generated_individual_only":
      return "선택한 포즈는 통합 저장을 지원하지 않아요.";
    default:
      return "이 작업은 통합 저장을 지원하지 않아요.";
  }
}

/** Only the chosen final outputs matter; BFF still reauthorizes every receipt on prepare. */
export function sceneSelectionAvailable(
  analysis: AnalysisResult | undefined,
  picks: Record<number, string>,
) {
  if (!analysis?.capabilities.sceneExport) return false;
  const availability = analysis.capabilities.sceneAvailability;
  if (availability && !analysis.capabilities.sceneSaveContract) return false;
  if (
    analysis.capabilities.sceneSaveContract?.manifestVersion &&
    availability?.manifest.available !== true
  )
    return false;
  return Object.entries(picks).every(([index, id]) => {
    const candidate = analysis.people
      .find((p) => p.index === Number(index))
      ?.candidates.find((c) => c.id === id);
    if (!candidate || !canRelease(candidate)) return false;
    if (availability)
      return (
        availability.originalSelection.available &&
        availability.candidateEligibility
          .find((p) => p.personIndex === Number(index))
          ?.candidates.find((c) => c.candidateId === id)?.available === true
      );
    return candidate.source !== "generation";
  });
}
