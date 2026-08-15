import { apiFetch, apiFetchBlob } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { AnalysisError } from "./pose.contract";
import type {
  AnalysisResult,
  CoverageClass,
  FallbackMode,
  MatchLevel,
  PersonConfidence,
  PersonResult,
  PoseCandidate,
  PoseResultService,
  SkeletonSource,
  SkeletonState,
} from "./pose.contract";

/** BFF의 비동기 분석 Job 계약. */
type AnalysisJobStatus = "queued" | "running" | "completed" | "failed";

type CreateJobResponse = {
  jobId: string;
  status: AnalysisJobStatus;
  createdAt: string;
};

type JobStatusResponse = CreateJobResponse & {
  updatedAt: string;
  error: string | null;
};

type BffCandidate = {
  id: string;
  poseId: string;
  rank: number;
  view: string;
  tags: string[];
  matchLevel: MatchLevel;
  bvhAvailable: boolean;
  thumbnailUrl?: string;
};

type BffAnalysisResult = {
  jobId: string;
  notes: string[];
  /** 구 BFF에는 없다. 없으면 refine을 노출하지 않는다. */
  capabilities?: { refine?: boolean };
  candidatesByPerson: Array<{
    personIndex: number;
    box: number[] | null;
    tags: Record<string, string>;
    candidates: BffCandidate[];
    // 스켈레톤 품질 신호. 구 BFF 응답에는 없으므로 전부 optional로 받는다.
    confidence?: string;
    skeletonState?: string;
    skeletonSource?: string;
    coverageClass?: string;
    fallbackMode?: string;
    refineAllowed?: boolean;
    refinableLimbs?: string[];
  }>;
};

/**
 * 모르는 값이나 없는 값을 **안전한 쪽**으로 좁힌다(FE-01).
 *
 * 안전한 쪽 = 사용자에게 덜 약속하는 쪽이다. 클라와 BFF는 순차 배포되므로 신규 필드가
 * 통째로 없는 응답을 받는 창이 반드시 생긴다. 그때 낙관적으로 해석하면 저정보 결과가
 * 아무 경고 없이 일반 후보처럼 보이고 refine까지 걸린다.
 */
function narrow<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const CONFIDENCE = ["high", "low"] as const satisfies readonly PersonConfidence[];
const SKELETON_STATE = [
  "valid",
  "partial",
  "suspect",
  "missing",
  "invalid",
] as const satisfies readonly SkeletonState[];
const SKELETON_SOURCE = [
  "full_image",
  "crop_retry",
  "none",
] as const satisfies readonly SkeletonSource[];
const COVERAGE_CLASS = [
  "full",
  "reduced",
  "sparse",
  "insufficient",
] as const satisfies readonly CoverageClass[];
const FALLBACK_MODE = ["none", "soft", "hard"] as const satisfies readonly FallbackMode[];

/** `fallbackMode`가 없는 구 BFF 응답은 후보 유무와 신뢰도로 직접 계산한다. */
function resolveFallbackMode(
  raw: unknown,
  confidence: PersonConfidence,
  candidateCount: number,
): FallbackMode {
  if (candidateCount === 0) return "hard";
  const known = narrow(FALLBACK_MODE, raw, confidence === "high" ? "none" : "soft");
  // 후보가 있는데 hard라고 온 응답은 신뢰하지 않는다 — 화면이 후보를 숨겨 버린다.
  return known === "hard" ? "soft" : known;
}

const POLL_INTERVAL_MS = 750;
const JOB_TIMEOUT_MS = 3 * 60 * 1000;

function analysisTimeoutError(): AnalysisError {
  return new AnalysisError(
    "TIMEOUT",
    "분석 시간이 너무 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.",
  );
}

/**
 * 폴링 루프에서 시각만 확인하면 진행 중인 fetch가 응답하지 않을 때 deadline을 다시
 * 검사하지 못한다. 하나의 AbortSignal을 Job 생성부터 결과 변환까지 전부 전달한다.
 */
function createAnalysisDeadline(parent?: AbortSignal) {
  const controller = new AbortController();
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let timedOut = false;

  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Analysis timed out", "TimeoutError"));
  }, JOB_TIMEOUT_MS);

  return {
    signal: controller.signal,
    deadline,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === "function") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function loadThumbnail(path: string | undefined, signal: AbortSignal): Promise<string> {
  if (!path) return "";
  try {
    return await blobToDataUrl(await apiFetchBlob(path, { auth: false, signal }));
  } catch (error) {
    // deadline/화면 이탈 취소는 빈 썸네일로 삼키지 않고 상위 요청까지 종료한다.
    if (signal.aborted) throw error;
    // 썸네일 하나가 없어도 분석 후보와 BVH 저장은 계속 제공한다.
    return "";
  }
}

async function toPoseCandidate(
  raw: BffCandidate,
  jobId: string,
  personIndex: number,
  signal: AbortSignal,
): Promise<PoseCandidate> {
  const thumbnailUrl = await loadThumbnail(raw.thumbnailUrl, signal);
  return {
    id: raw.id,
    poseId: raw.poseId,
    rank: raw.rank,
    title: `포즈 ${raw.id}`,
    tags: raw.tags,
    matchLevel: raw.matchLevel,
    thumbnailUrl,
    previewImages: thumbnailUrl ? [{ view: raw.view, url: thumbnailUrl }] : [],
    modelUrl: null,
    bvhAvailable: raw.bvhAvailable,
    bvhUrl: raw.bvhAvailable
      ? endpoints.poseCandidates.export(raw.poseId, jobId, personIndex, raw.id)
      : undefined,
  };
}

async function toAnalysisResult(
  raw: BffAnalysisResult,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  const people: PersonResult[] = await Promise.all(
    raw.candidatesByPerson.map(async (person) => {
      const confidence = narrow(CONFIDENCE, person.confidence, "low");
      return {
        // 서버 personIndex를 그대로 쓴다. 화면에서 탐지 순서로 다시 번호를 매기지 않는다.
        index: person.personIndex,
        candidates: await Promise.all(
          person.candidates.map((candidate) =>
            toPoseCandidate(candidate, raw.jobId, person.personIndex, signal),
          ),
        ),
        confidence,
        skeletonState: narrow(SKELETON_STATE, person.skeletonState, "invalid"),
        skeletonSource: narrow(SKELETON_SOURCE, person.skeletonSource, "none"),
        coverageClass: narrow(COVERAGE_CLASS, person.coverageClass, "insufficient"),
        fallbackMode: resolveFallbackMode(
          person.fallbackMode,
          confidence,
          person.candidates.length,
        ),
        // 허용은 명시적일 때만. 구 BFF 응답에서는 refine을 걸지 않는다.
        refineAllowed: person.refineAllowed === true,
        refinableLimbs: person.refinableLimbs ?? [],
      } satisfies PersonResult;
    }),
  );

  if (people.length === 0) {
    throw new AnalysisError("NO_PEOPLE", "이미지에서 인물을 찾지 못했습니다.");
  }

  return {
    jobId: raw.jobId,
    people,
    capabilities: { refine: raw.capabilities?.refine === true },
  };
}

async function waitForResult(
  jobId: string,
  deadline: number,
  signal: AbortSignal,
): Promise<BffAnalysisResult> {
  while (Date.now() < deadline) {
    const job = await apiFetch<JobStatusResponse>(endpoints.analysis.job(jobId), {
      auth: false,
      signal,
    });

    if (job.status === "completed") {
      return apiFetch<BffAnalysisResult>(endpoints.analysis.result(jobId), {
        auth: false,
        signal,
      });
    }
    if (job.status === "failed") {
      throw new AnalysisError(
        "JOB_FAILED",
        "포즈 분석에 실패했습니다. 다른 이미지로 다시 시도해 주세요.",
      );
    }

    await delay(POLL_INTERVAL_MS, signal);
  }

  throw analysisTimeoutError();
}

export const poseHttp: PoseResultService = {
  async analyze({ file, source, width, height, signal: parentSignal }): Promise<AnalysisResult> {
    const timeout = createAnalysisDeadline(parentSignal);
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("source", source);
    formData.append("width", String(width));
    formData.append("height", String(height));

    try {
      const job = await apiFetch<CreateJobResponse>(endpoints.analysis.jobs, {
        method: "POST",
        body: formData,
        auth: false,
        signal: timeout.signal,
      });
      const result = await waitForResult(job.jobId, timeout.deadline, timeout.signal);
      const analysis = await toAnalysisResult(result, timeout.signal);
      if (timeout.signal.aborted) throw timeout.signal.reason;
      return analysis;
    } catch (error) {
      if (timeout.didTimeOut()) throw analysisTimeoutError();
      throw error;
    } finally {
      timeout.dispose();
    }
  },
};
