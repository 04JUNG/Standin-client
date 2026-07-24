/**
 * 포즈 후보 결과 계약. docs/09 §2, docs/03 §7.
 * 실 서버(도원 포즈 파이프라인)는 job 폴링이 아니라 이미지 파일을 즉시 분석해 응답한다.
 * jobId는 서버 개념이 아니라 라우팅·쿼리 키용 클라이언트 식별자다.
 */
export type MatchLevel = "high" | "medium" | "low";

export type PoseCandidate = {
  id: string;
  rank: number;
  title: string;
  tags: string[];
  matchLevel: MatchLevel;
  thumbnailUrl: string;
  previewImages: Array<{ view: string; url: string }>;
  modelUrl?: string | null;
  bvhAvailable: boolean;
  /** 실 서버 후보의 BVH 원본 다운로드 절대 URL. Mock 후보에는 없음(저장 시 placeholder로 대체). */
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

export interface PoseResultService {
  analyze(input: { jobId: string; file: File }): Promise<AnalysisResult>;
}
