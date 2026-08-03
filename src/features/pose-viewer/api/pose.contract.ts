/**
 * 포즈 후보 결과 계약. docs/09 §2, docs/03 §7.
 * 클라이언트는 BFF에 분석 Job을 만들고 완료될 때까지 폴링한 뒤 이 형태로 변환한다.
 * 라우트의 jobId는 쿼리 키용 클라이언트 식별자이며, 응답의 jobId는 BFF가 발급한 값이다.
 */
export type MatchLevel = "high" | "medium" | "low";

export type PoseCandidate = {
  id: string;
  poseId: string;
  rank: number;
  title: string;
  tags: string[];
  matchLevel: MatchLevel;
  thumbnailUrl: string;
  previewImages: Array<{ view: string; url: string }>;
  modelUrl?: string | null;
  bvhAvailable: boolean;
  /** BFF를 통한 BVH 다운로드 경로. Mock 후보에는 없음(저장 시 placeholder로 대체). */
  bvhUrl?: string;
};

/** 검출된 인물 한 명과 그 인물의 포즈 후보들. index는 실 서버 people[].index를 그대로 따른다. */
export type PersonResult = {
  index: number;
  candidates: PoseCandidate[];
};

export type AnalysisResult = {
  jobId: string;
  inputPreviewUrl?: string;
  people: PersonResult[];
};

/**
 * 분석이 실패한 사유. 사용자 문구가 아니라 분류용 코드다 — `analysis_failed` 이벤트가
 * 이 값을 그대로 싣는다. 문구만으로는 "실패"와 "시간 초과"를 지표에서 구분할 수 없다.
 */
export type AnalysisErrorCode = "JOB_FAILED" | "TIMEOUT" | "NO_PEOPLE";

export class AnalysisError extends Error {
  constructor(
    public readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export interface PoseResultService {
  analyze(input: {
    jobId: string;
    file: File;
    source: "file" | "capture" | "clipboard";
    width: number;
    height: number;
  }): Promise<AnalysisResult>;
}
