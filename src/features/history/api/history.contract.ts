/**
 * 작업 기록 계약. BFF `GET /v1/analysis/jobs` (app-server docs/API.md).
 *
 * 서버가 단일 진실 공급원이다 — 로컬 캐시를 두지 않는다. 오프라인이면 목록이 비는 것이
 * 아니라 오류와 재시도를 보여준다(docs/09 §5).
 */

/** BFF의 Job 상태. 동기 추론을 감싸므로 세분 단계는 제공되지 않는다. */
export type JobHistoryStatus = "queued" | "running" | "completed" | "failed";

export type JobHistoryItem = {
  jobId: string;
  status: JobHistoryStatus;
  createdAt: string;
  completedAt: string | null;
  /** status=failed일 때의 분류 코드. 화면 문구는 앱이 고른다. */
  errorCode: string | null;
  source: string | null;
  personCount: number;
  selectionCount: number;
  hasSelection: boolean;
  /**
   * 매칭된 **포즈 후보**의 썸네일 경로(입력 러프가 아니다). 인증 헤더가 필요한
   * 상대 경로라 `<img src>`에 그대로 넣을 수 없다 — apiFetchBlob으로 받아야 한다.
   */
  thumbnailUrl: string | null;
  /** 입력 원본이 아직 S3에 있는가. 보관 기간(90일)이 지나면 false. */
  inputAvailable: boolean;
  inputWidth: number | null;
  inputHeight: number | null;
};

export type JobHistoryPage = {
  items: JobHistoryItem[];
  /** null이면 마지막 페이지. */
  nextCursor: string | null;
};

export type JobSelection = {
  personIndex: number;
  candidateId: string;
  rank: number;
  confirmedAt: string;
};

export interface HistoryService {
  list(input: {
    limit?: number;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<JobHistoryPage>;

  /** 확정 선택. 기록 상세가 이전 선택을 화면에 되살릴 때 쓴다. */
  selections(input: { jobId: string; signal?: AbortSignal }): Promise<JobSelection[]>;

  remove(input: { jobId: string }): Promise<void>;
}
