import { hasPresentationCandidates, presentationNotice } from "../api/presentationState";
import { ChevronRight } from "lucide-react";
import { BodyLabel } from "@/features/body-selection/BodyCandidates";
import type { BodyEntry } from "@/features/body-selection/hooks";
import { cn } from "@/shared/lib/cn";
import type { PersonResult } from "../api/pose.contract";
import { ExportSwitch } from "./ExportSwitch";
import { RoughThumb } from "./RoughPanel";

/** 현재 편집 중인 인물도 같은 자리에 유지한다. 선택 스위치와 인물 이동은 별도 버튼이다. */
export function PersonIndexRow({
  first,
  jobId,
  person,
  roughUrl,
  bodiesEnabled,
  entry,
  active,
  included,
  onIncluded,
  selectedTitle,
  onOpen,
}: {
  first: boolean;
  jobId: string;
  person: PersonResult;
  roughUrl?: string;
  bodiesEnabled: boolean;
  entry?: BodyEntry;
  active: boolean;
  included: boolean;
  onIncluded(value: boolean): void;
  selectedTitle?: string;
  onOpen(): void;
}) {
  const hard = person.fallbackMode === "hard";
  const empty = person.candidates.length === 0;
  const reference = hasPresentationCandidates(person.posePresentation) && empty;
  return (
    <div
      className={cn(
        "-mx-2 flex items-center gap-3 rounded-lg px-2",
        !first && "border-t border-surface-2",
        active && "bg-brand-sky/15",
      )}
    >
      <div className="w-[128px] shrink-0">
        {reference ? (
          <span className="text-xs">참고용 포즈</span>
        ) : empty ? (
          <span className="text-[11.5px] text-text-secondary">후보 없음</span>
        ) : (
          <ExportSwitch
            personIndex={person.index}
            label={`인물 ${person.index + 1} 선택`}
            included={included}
            onChange={onIncluded}
          />
        )}
      </div>
      <button
        type="button"
        aria-label={`인물 ${person.index + 1} 펼치기`}
        aria-pressed={active}
        onClick={onOpen}
        className="group grid min-w-0 flex-1 grid-cols-[36px_minmax(0,1.2fr)_minmax(0,1fr)_16px] items-center gap-3 rounded-lg py-1.5 text-left transition-colors hover:bg-surface-1 active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
      >
        <RoughThumb
          url={roughUrl}
          box={person.box}
          personIndex={person.index}
          className={cn("h-[46px] w-9", (!included || hard) && "opacity-60")}
        />
        <span className="flex min-w-0 flex-col">
          <span className="text-[12.5px] font-semibold text-text-primary">
            인물 {person.index + 1}
            {active && <span className="ml-2 text-[11px] text-text-secondary">현재 보는 인물</span>}
          </span>
          {bodiesEnabled && !hard && <BodyLabel job={jobId} person={person} entry={entry} />}
        </span>
        <span className="truncate text-[12px] text-text-secondary">
          {reference
            ? "참고 포즈 펼치기"
            : empty
              ? (person.posePresentation && presentationNotice(person.posePresentation)) ||
                "이 인물에 맞는 포즈 후보를 찾지 못했습니다"
              : !included
                ? "인물 선택 꺼짐"
                : selectedTitle
                  ? `고름: ${selectedTitle}`
                  : "포즈를 아직 안 골랐어요"}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "h-4 w-4 text-text-secondary transition-opacity",
            active
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        />
      </button>
    </div>
  );
}
