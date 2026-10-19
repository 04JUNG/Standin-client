import { previewScope } from "../api/outputScope";
import { PosePresentationPanel, type PresentationSelection } from "./PosePresentationPanel";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { PersonResult } from "../api/pose.contract";

/**
 * 인물 단위 폴백 안내(FE-02).
 *
 * 앱 모드와 바 모드가 같은 문구를 쓴다 — 어디서 봤는지에 따라 경고가 달라지면 작가가
 * 같은 결과를 다르게 판단한다.
 *
 * raw distance나 quality_trace는 노출하지 않는다. 작가가 판단에 쓸 수 있는 정보가 아니다.
 */
const NOTICE: Record<"soft" | "hard", { text: string; tone: "warn" | "info" }> = {
  soft: {
    text: "그림 속 자세를 정확히 읽기 어려웠어요. 러프와 비교해 포즈를 골라 주세요.",
    tone: "info",
  },
  hard: {
    text: "이 인물에 맞는 포즈 후보를 찾지 못했습니다.",
    tone: "warn",
  },
};

type PersonFallbackNoticeProps = {
  person: Pick<
    PersonResult,
    | "fallbackMode"
    | "candidateShortfallReason"
    | "coverageClass"
    | "routedSearch"
    | "posePresentation"
  > & { candidates?: PersonResult["candidates"]; outputScope?: PersonResult["outputScope"] };
  /** 바 모드는 폭이 좁아 더 작은 글자를 쓴다. */
  compact?: boolean;
  bodyPreviewJob?: string;
  selection?: PresentationSelection;
};

export function PersonFallbackNotice({
  person,
  compact = false,
  bodyPreviewJob,
  selection,
}: PersonFallbackNoticeProps) {
  if (person.posePresentation)
    return (
      <PosePresentationPanel
        presentation={{ ...person.posePresentation, output_scope: previewScope(person) }}
        compact={compact}
        selectableLibrary={person.candidates?.some(
          (c) => c.source === "library" && c.releaseAllowed === true,
        )}
        bodyPreviewJob={bodyPreviewJob}
        selection={selection}
      />
    );
  if (person.routedSearch) {
    const r = person.routedSearch;
    const route =
      (
        {
          hybrid: "자세와 동작으로 찾은 포즈",
          geometric: "자세로 찾은 포즈",
          semantic: "동작 설명으로 찾은 포즈",
          basic_model: "기본 자세",
        } as Record<string, string>
      )[r.route] ?? "포즈 검색";
    const status =
      (
        {
          ok: "포즈를 찾았어요",
          no_result: "비슷한 포즈가 없어요",
          error: "검색을 마치지 못했어요",
          partial_error: "일부 포즈를 찾지 못했어요",
          blocked: "지금은 포즈를 찾을 수 없어요",
          undetermined: "이 장면의 자세를 확인하기 어려워요",
          not_run: "검색을 진행하지 않았어요",
        } as Record<string, string>
      )[r.status] ?? "이 장면의 자세를 확인하기 어려워요";
    return (
      <div
        role="status"
        className={cn(
          "rounded-lg bg-surface-2 px-2 py-1.5 text-text-secondary",
          compact ? "text-[11px]" : "text-[12px]",
        )}
      >
        <p>{r.basicModel ? "기본 자세를 참고해 보세요" : `${route} · ${status}`}</p>
        <p>
          {r.basicModel
            ? "찾은 포즈 대신 기본 자세를 참고용으로 보여드려요."
            : "이 포즈는 참고용으로만 볼 수 있어요. 러프에 맞춰 자동으로 바꾸거나 파일로 저장할 수는 없어요. 러프와 보는 각도가 다를 수 있어요."}
        </p>
        {r.nearCandidateCount > 0 && <p>러프와 일부 다른 포즈 {r.nearCandidateCount}개 · 참고용</p>}
        {r.framingReferenceCount > 0 && (
          <p>구도를 참고할 포즈 {r.framingReferenceCount}개 · 참고용</p>
        )}
        {r.generationStatus && (
          <p>
            새로 만든 포즈:{" "}
            {r.generationStatus === "preview_ready"
              ? `미리보기 후보 ${r.generatedCandidateCount}개 (저장 불가)`
              : r.generationStatus === "rejected"
                ? "사용할 수 있는 포즈를 만들지 못했어요"
                : "새로 만든 포즈가 없어요"}
          </p>
        )}
      </div>
    );
  }
  if (person.fallbackMode === "none") return null;

  const { text, tone } = NOTICE[person.fallbackMode];
  const message =
    person.candidateShortfallReason === "HEAD_SEARCH_UNSUPPORTED"
      ? "얼굴만 보이는 장면에서는 아직 포즈를 찾을 수 없어요. 어깨와 팔이 보이는 장면으로 다시 시도해 주세요."
      : person.candidateShortfallReason === "ANALYSIS_ROUTE_SKIPPED"
        ? "이 장면에서는 아직 포즈를 찾기 어려워요. 다른 러프로 다시 시도해 주세요."
        : person.fallbackMode === "soft" && person.coverageClass === "upper_only"
          ? "보이는 어깨와 팔을 보고 찾은 포즈예요. 러프에 맞춘 자동 조정은 하지 않아요."
          : text;
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2 py-1.5",
        compact ? "text-[11px]" : "text-[12px]",
        tone === "warn" ? "bg-brand-coral/10 text-brand-coral" : "bg-surface-2 text-text-secondary",
      )}
    >
      <Icon className={cn("mt-px shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
      <span>{message}</span>
    </p>
  );
}
