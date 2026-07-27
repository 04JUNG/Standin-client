import { env } from "@/shared/lib/env";
import type { AnalysisResult, MatchLevel, PersonResult, PoseCandidate, PoseResultService } from "./pose.contract";

/**
 * 실 서버(도원 포즈 파이프라인) 어댑터. `/analyze`는 job이 아니라 즉시 응답이다
 * (OpenAPI 확인: POST /analyze, multipart 필드명 file → CutResultOut).
 * docs/08_API_CONTRACT.md의 job 폴링 계약은 이 실 서버와 다르다 — 문서 갱신 필요(docs/05 §8).
 */

// 서버 원본 응답 타입. 이 파일이 정본이며 CutResultOut 등 서버 스키마 이름을 그대로 따른다.
type CandidateOut = {
  pose_id: string;
  view: string;
  distance: number;
  tags: Record<string, unknown>;
  rerank_score: number | null;
  bvh_url: string;
  thumbnail_url: string | null;
};

type PersonOut = {
  index: number;
  box: [number, number, number, number] | null;
  tags: Record<string, unknown>;
  candidates: CandidateOut[];
};

type CutResultOut = {
  route: string;
  count_confidence: string;
  detector_count: number;
  vlm_count: number;
  people: PersonOut[];
  notes: string[];
};

function resolveUrl(path: string): string {
  return path.startsWith("http") ? path : `${env.apiBaseUrl}${path}`;
}

/** 자유 형식 tags 객체를 카드에 보여줄 짧은 문자열 태그 몇 개로 축약한다. */
function tagsToChips(tags: Record<string, unknown>): string[] {
  return Object.entries(tags)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "")
    .map(([key, value]) => (value === true ? key : `${key}:${String(value)}`))
    .slice(0, 3);
}

/**
 * distance/rerank_score는 모델 내부 점수라 그대로 노출하지 않는다(docs/01 §6).
 * 서버가 이미 정렬해서 준다고 가정하고 순위 기반으로만 high/medium/low를 나눈다.
 */
function matchLevelByRank(rank: number): MatchLevel {
  if (rank <= 2) return "high";
  if (rank <= 3) return "medium";
  return "low";
}

function toPoseCandidate(raw: CandidateOut, rank: number, personIndex: number): PoseCandidate {
  const thumbnailUrl = raw.thumbnail_url ? resolveUrl(raw.thumbnail_url) : "";
  return {
    // 인물별로 같은 pose_id가 후보로 나올 수 있어 personIndex로 네임스페이스를 나눈다.
    id: `p${personIndex}-${raw.pose_id}-${raw.view}`,
    rank,
    title: `포즈 ${raw.pose_id}`,
    tags: tagsToChips(raw.tags),
    matchLevel: matchLevelByRank(rank),
    thumbnailUrl,
    previewImages: [{ view: raw.view, url: thumbnailUrl }],
    modelUrl: null,
    bvhAvailable: true,
    bvhUrl: resolveUrl(raw.bvh_url),
  };
}

export const poseHttp: PoseResultService = {
  async analyze({ jobId, file }: { jobId: string; file: File }): Promise<AnalysisResult> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    let res: Response;
    try {
      res = await fetch(`${env.apiBaseUrl}/analyze`, { method: "POST", body: formData });
    } catch {
      throw new Error("분석 서버에 연결할 수 없습니다.");
    }

    if (!res.ok) {
      throw new Error(`분석 요청이 실패했습니다. (HTTP ${res.status})`);
    }

    const data = (await res.json()) as CutResultOut;
    // 후보를 하나도 못 찾은 인물도 목록에 남긴다(뷰어에서 "검색 실패"로 표시, docs/03 §7 갱신 필요).
    // 여기서 조용히 빼면 인물 수와 화면에 보이는 카드 수가 안 맞아 보인다.
    const people: PersonResult[] = data.people.map((person) => ({
      index: person.index,
      candidates: person.candidates.map((c, i) => toPoseCandidate(c, i + 1, person.index)),
    }));

    if (people.length === 0) {
      throw new Error("이미지에서 인물을 찾지 못했습니다.");
    }

    return { jobId, people };
  },
};
