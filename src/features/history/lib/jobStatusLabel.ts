import type { JobHistoryItem } from "../api/history.contract";

export type JobStatusTone = "done" | "failed" | "running";

export type JobStatusDisplay = {
  label: string;
  tone: JobStatusTone;
  /** 실패 사유 등 배지 옆에 덧붙일 한 줄. 없으면 null. */
  detail: string | null;
};

/**
 * 상태와 실패 코드를 화면 문구로 옮긴다.
 *
 * 실패 사유를 하나로 뭉개지 않는 것이 핵심이다. 상류 VLM 혼잡(`ANALYSIS_UNAVAILABLE`)은
 * **같은 이미지로 잠시 뒤 다시 하면 되는** 상태인데, 일반 실패로 뭉개면 화면이 "다른
 * 이미지로 다시 시도"를 안내하게 된다. 문구는 pose.http.ts의 기존 분기와 맞춘다.
 */
export function jobStatusDisplay(item: Pick<JobHistoryItem, "status" | "errorCode">): JobStatusDisplay {
  if (item.status === "completed") return { label: "완료", tone: "done", detail: null };
  if (item.status === "queued" || item.status === "running") {
    return { label: "분석 중", tone: "running", detail: null };
  }

  switch (item.errorCode) {
    case "ANALYSIS_UNAVAILABLE":
      return { label: "실패", tone: "failed", detail: "분석 서버가 혼잡했습니다. 같은 이미지로 다시 시도할 수 있습니다." };
    case "ANALYSIS_TIMEOUT":
      return { label: "실패", tone: "failed", detail: "분석 시간이 초과되었습니다." };
    case "ABANDONED":
      return { label: "실패", tone: "failed", detail: "분석이 중단되었습니다." };
    case "INPUT_STORAGE_FAILED":
      return { label: "실패", tone: "failed", detail: "입력 이미지를 보관하지 못했습니다." };
    default:
      return { label: "실패", tone: "failed", detail: "포즈 분석에 실패했습니다." };
  }
}

/** 기록 항목을 열어 후보를 볼 수 있는가. 완료됐고 인물이 하나라도 있어야 한다. */
export function isOpenable(item: Pick<JobHistoryItem, "status" | "personCount">): boolean {
  return item.status === "completed" && item.personCount > 0;
}

/** 열 수 없는 항목에 붙일 사유. 열 수 있으면 null. */
export function unopenableReason(
  item: Pick<JobHistoryItem, "status" | "personCount">,
): string | null {
  if (isOpenable(item)) return null;
  if (item.status === "queued" || item.status === "running") return "분석이 끝나면 열 수 있습니다.";
  if (item.status === "failed") return "실패한 작업은 결과가 없습니다.";
  return "이 작업에서는 인물을 찾지 못했습니다.";
}
