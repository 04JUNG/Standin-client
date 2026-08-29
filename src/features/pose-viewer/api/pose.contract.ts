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

export type PersonConfidence = "high" | "low";
export type SkeletonState = "valid" | "partial" | "suspect" | "missing" | "invalid";
export type SkeletonSource = "full_image" | "crop_retry" | "none";
export type CoverageClass = "full" | "reduced" | "sparse" | "insufficient";

/**
 * 인물 단위 폴백 상태(BFF `fallbackMode`).
 *
 * - `none` — 일반 Top-5
 * - `soft` — 스켈레톤 인식이 불확실하다. 후보는 보여주되 참고용이라고 알리고 refine은 금지
 * - `hard` — 이 인물에 자동 후보가 없다. 다른 인물의 흐름은 계속 진행한다
 *
 * soft와 hard를 하나로 뭉치면 "참고용 후보가 있다"와 "후보가 없다"를 화면이 구분할 수 없다.
 */
export type FallbackMode = "none" | "soft" | "hard";

/** 검출된 인물 한 명과 그 인물의 포즈 후보들. index는 실 서버 people[].index를 그대로 따른다. */
export type PersonResult = {
  index: number;
  candidates: PoseCandidate[];
  confidence: PersonConfidence;
  skeletonState: SkeletonState;
  skeletonSource: SkeletonSource;
  coverageClass: CoverageClass;
  fallbackMode: FallbackMode;
  refineAllowed: boolean;
  refinableLimbs: string[];
};

export type AnalysisResult = {
  jobId: string;
  inputPreviewUrl?: string;
  people: PersonResult[];
  /**
   * 서버가 이 기능을 노출하는가. 추론 endpoint가 살아 있어도 BFF flag가 꺼져 있으면
   * false가 오고, 클라이언트는 그걸 따른다(자기 판단으로 호출하지 않는다).
   */
  capabilities: { refine: boolean };
};

/**
 * 분석이 실패한 사유. 사용자 문구가 아니라 분류용 코드다 — `analysis_failed` 이벤트가
 * 이 값을 그대로 싣는다. 문구만으로는 "실패"와 "시간 초과"를 지표에서 구분할 수 없다.
 */
export type AnalysisErrorCode =
  | "JOB_FAILED"
  | "TIMEOUT"
  | "NO_PEOPLE"
  | "ABANDONED"
  /** 기록에서 열었는데 아직 끝나지 않았거나 결과가 없는 Job이다(BFF `NOT_READY`). */
  | "NOT_READY"
  /** 상류 VLM 혼잡. 같은 이미지로 잠시 후 다시 하면 된다(BFF `ANALYSIS_UNAVAILABLE`). */
  | "UPSTREAM_UNAVAILABLE";

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
  /**
   * 이미 끝난 Job의 저장된 결과를 그대로 읽는다. 작업 기록에서 상세로 들어올 때 쓴다.
   *
   * `analyze`와 달리 업로드도 폴링도 하지 않는다 — 원본 파일이 없어도 되고, 쿼터를
   * 깎거나 동시 분석 슬롯을 잡지도 않는다.
   */
  loadResult(input: { jobId: string; signal?: AbortSignal }): Promise<AnalysisResult>;

  analyze(input: {
    jobId: string;
    file: File;
    source: "file" | "capture" | "clipboard";
    width: number;
    height: number;
    /** React Query가 화면 이탈/쿼리 취소 시 진행 중인 HTTP 요청까지 중단한다. */
    signal?: AbortSignal;
  }): Promise<AnalysisResult>;
}
