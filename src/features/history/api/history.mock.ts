import type {
  HistoryService,
  JobHistoryItem,
  JobHistoryPage,
  JobSelection,
} from "./history.contract";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 화면이 다뤄야 하는 모양을 전부 넣는다 — 완료+선택함, 완료+선택안함, 후보 없는 실패,
 * 상류 혼잡 실패, 진행 중, 썸네일 없음. 하나라도 빠지면 실서버에 붙기 전까지 그 분기는
 * 아무도 보지 못한다(pose.mock.ts와 같은 이유).
 */
const ITEMS: JobHistoryItem[] = [
  {
    jobId: "job_00000000-0000-4000-8000-000000000001",
    status: "completed",
    createdAt: "2026-08-29T09:12:00.000Z",
    completedAt: "2026-08-29T09:12:08.000Z",
    errorCode: null,
    source: "capture",
    personCount: 2,
    selectionCount: 2,
    hasSelection: true,
    thumbnailUrl: "/v1/pose-candidates/mock-pose-1/thumbnail?view=front",
    inputAvailable: true,
    inputWidth: 1920,
    inputHeight: 1080,
  },
  {
    jobId: "job_00000000-0000-4000-8000-000000000002",
    status: "completed",
    createdAt: "2026-08-28T22:40:00.000Z",
    completedAt: "2026-08-28T22:40:06.000Z",
    errorCode: null,
    source: "file",
    personCount: 1,
    selectionCount: 0,
    hasSelection: false,
    thumbnailUrl: "/v1/pose-candidates/mock-pose-2/thumbnail?view=side",
    inputAvailable: true,
    inputWidth: 1400,
    inputHeight: 2200,
  },
  {
    jobId: "job_00000000-0000-4000-8000-000000000003",
    status: "running",
    createdAt: "2026-08-28T21:05:00.000Z",
    completedAt: null,
    errorCode: null,
    source: "clipboard",
    personCount: 0,
    selectionCount: 0,
    hasSelection: false,
    thumbnailUrl: null,
    inputAvailable: true,
    inputWidth: null,
    inputHeight: null,
  },
  {
    jobId: "job_00000000-0000-4000-8000-000000000004",
    status: "failed",
    createdAt: "2026-08-27T14:30:00.000Z",
    completedAt: "2026-08-27T14:30:03.000Z",
    errorCode: "ANALYSIS_UNAVAILABLE",
    source: "capture",
    personCount: 0,
    selectionCount: 0,
    hasSelection: false,
    thumbnailUrl: null,
    inputAvailable: true,
    inputWidth: 1280,
    inputHeight: 720,
  },
  {
    // 보관 기간(90일)이 지나 원본이 사라진 옛 작업.
    jobId: "job_00000000-0000-4000-8000-000000000005",
    status: "completed",
    createdAt: "2026-05-02T08:00:00.000Z",
    completedAt: "2026-05-02T08:00:11.000Z",
    errorCode: null,
    source: "file",
    personCount: 1,
    selectionCount: 1,
    hasSelection: true,
    thumbnailUrl: null,
    inputAvailable: false,
    inputWidth: 900,
    inputHeight: 1600,
  },
];

/** Mock은 삭제를 메모리에만 반영한다. 새로고침하면 되살아난다. */
const removed = new Set<string>();

export const historyMock: HistoryService = {
  async list({ limit = 20, cursor }): Promise<JobHistoryPage> {
    await delay(400);
    const alive = ITEMS.filter((item) => !removed.has(item.jobId));
    // 커서는 "여기부터"를 가리키는 jobId다. 실서버 커서와 형태가 다르지만, 화면이
    // 커서를 불투명하게 다루므로(값을 해석하지 않는다) 그대로 통한다.
    const start = cursor ? alive.findIndex((item) => item.jobId === cursor) : 0;
    const page = alive.slice(Math.max(start, 0), Math.max(start, 0) + limit);
    const next = alive[Math.max(start, 0) + limit];
    return { items: page, nextCursor: next?.jobId ?? null };
  },

  async selections({ jobId }): Promise<JobSelection[]> {
    await delay(150);
    const item = ITEMS.find((entry) => entry.jobId === jobId);
    if (!item?.hasSelection) return [];
    return Array.from({ length: item.selectionCount }, (_, personIndex) => ({
      personIndex,
      candidateId: `${jobId}-p${personIndex}-c0`,
      rank: 1,
      confirmedAt: item.completedAt ?? item.createdAt,
    }));
  },

  async remove({ jobId }): Promise<void> {
    await delay(200);
    removed.add(jobId);
  },
};
