import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type {
  HistoryService,
  JobHistoryItem,
  JobHistoryPage,
  JobHistoryStatus,
  JobSelection,
} from "./history.contract";

/**
 * 모르는 값이나 없는 값을 안전한 쪽으로 좁힌다(pose.http.ts의 `narrow`와 같은 이유).
 * 클라와 BFF는 순차 배포되므로 신규 필드가 통째로 없는 응답을 받는 창이 반드시 생긴다.
 */
const STATUSES = ["queued", "running", "completed", "failed"] as const;

function toStatus(value: unknown): JobHistoryStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value)
    ? (value as JobHistoryStatus)
    : "failed";
}

type RawItem = Partial<Record<keyof JobHistoryItem, unknown>>;

function toItem(raw: RawItem): JobHistoryItem {
  const selectionCount = typeof raw.selectionCount === "number" ? raw.selectionCount : 0;
  return {
    jobId: String(raw.jobId ?? ""),
    status: toStatus(raw.status),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    errorCode: typeof raw.errorCode === "string" ? raw.errorCode : null,
    source: typeof raw.source === "string" ? raw.source : null,
    personCount: typeof raw.personCount === "number" ? raw.personCount : 0,
    selectionCount,
    hasSelection: raw.hasSelection === true || selectionCount > 0,
    thumbnailUrl: typeof raw.thumbnailUrl === "string" ? raw.thumbnailUrl : null,
    inputAvailable: raw.inputAvailable === true,
    inputWidth: typeof raw.inputWidth === "number" ? raw.inputWidth : null,
    inputHeight: typeof raw.inputHeight === "number" ? raw.inputHeight : null,
  };
}

export const historyHttp: HistoryService = {
  async list({ limit, cursor, signal }): Promise<JobHistoryPage> {
    const raw = await apiFetch<{ items?: RawItem[]; nextCursor?: unknown }>(
      endpoints.analysis.jobList({ limit, cursor }),
      { auth: false, signal },
    );
    return {
      items: (raw.items ?? []).map(toItem),
      nextCursor: typeof raw.nextCursor === "string" ? raw.nextCursor : null,
    };
  },

  async selections({ jobId, signal }): Promise<JobSelection[]> {
    const raw = await apiFetch<{ selections?: Array<Partial<JobSelection>> }>(
      endpoints.analysis.selections(jobId),
      { auth: false, signal },
    );
    return (raw.selections ?? []).flatMap((item) =>
      typeof item.personIndex === "number" && typeof item.candidateId === "string"
        ? [
            {
              personIndex: item.personIndex,
              candidateId: item.candidateId,
              rank: typeof item.rank === "number" ? item.rank : 0,
              confirmedAt: typeof item.confirmedAt === "string" ? item.confirmedAt : "",
            },
          ]
        : [],
    );
  },

  async remove({ jobId }): Promise<void> {
    await apiFetch(endpoints.analysis.job(jobId), { method: "DELETE", auth: false });
  },
};
