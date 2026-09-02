import { apiFetch, apiFetchBlob } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
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
  /** 입력 원본의 presigned URL. 보관 기간(90일)이 지났거나 구 BFF면 없다. */
  inputUrl?: string | null;
  /** 구 BFF에는 없다. 없으면 refine을 노출하지 않는다. */
  capabilities?: { refine?: boolean; fbxExport?: boolean };
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
 *
 * 단 **Job 생성 요청만은** 예외로 `createSignal`을 쓴다. 화면 이탈(쿼리 취소)로 생성
 * 요청을 끊어도 서버는 이미 Job을 만들었을 수 있고, 그러면 우리가 jobId를 모르는 Job이
 * 설치당 하나뿐인 동시 분석 슬롯을 잡은 채 남는다. 시간 초과에만 반응하게 둔다.
 */
function createAnalysisDeadline(parent?: AbortSignal) {
  const controller = new AbortController();
  const timeoutOnly = new AbortController();
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let timedOut = false;

  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException("Analysis timed out", "TimeoutError");
    timeoutOnly.abort(reason);
    controller.abort(reason);
  }, JOB_TIMEOUT_MS);

  return {
    signal: controller.signal,
    createSignal: timeoutOnly.signal,
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
    // 라이브 분석에서도 원본 미리보기가 draft의 blob URL에 의존하지 않게 된다.
    inputPreviewUrl: raw.inputUrl ?? undefined,
    people,
    capabilities: {
      refine: raw.capabilities?.refine === true,
      // 구버전 BFF에는 이 필드가 없다. 없으면 FBX를 노출하지 않는 쪽으로 좁힌다.
      fbxExport: raw.capabilities?.fbxExport === true,
    },
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
      // 서버가 실패 사유를 준다(BFF docs/API.md). 여기서 갈라내지 않으면 지표에서
      // "추론 실패"와 "배포로 유실됨"이 같은 값으로 뭉개진다.
      if (job.error === "ABANDONED") {
        throw new AnalysisError("ABANDONED", "분석이 중단됐습니다. 다시 시도해 주세요.");
      }
      // 상류(VLM)가 붐벼서 지금은 못 하는 상태다. 이걸 일반 실패로 뭉개면 화면이
      // "다른 이미지로 다시 시도"라고 안내하는데, 상류가 붐비는 동안에는 어떤 이미지도
      // 실패한다(2026-08-21 장애). 같은 입력으로 잠시 뒤 다시 하는 것이 맞다.
      if (job.error === "ANALYSIS_UNAVAILABLE") {
        throw new AnalysisError(
          "UPSTREAM_UNAVAILABLE",
          "지금 분석 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      throw new AnalysisError(
        "JOB_FAILED",
        "포즈 분석에 실패했습니다. 다른 이미지로 다시 시도해 주세요.",
      );
    }

    await delay(POLL_INTERVAL_MS, signal);
  }

  throw analysisTimeoutError();
}

type AnalyzeInput = Parameters<PoseResultService["analyze"]>[0];

/**
 * 화면 job(라우트의 jobId) → 그 입력으로 **이미 만든** 서버 Job.
 *
 * Job 생성은 조회가 아니라 자원 확보다 — 하루 쿼터를 깎고 설치당 하나뿐인 동시 분석
 * 슬롯을 잡는다. 그런데 `analyze`는 같은 화면 job으로 여러 번 불릴 수 있다. 창을
 * 최소화하면 라우트가 앱(/app/jobs/:id)에서 바(/bar/candidates)로 바뀌고(ADR-008),
 * 그 전환에서 쿼리가 취소·재실행되기 때문이다. 그때마다 Job을 새로 만들면 앞서 만든
 * Job이 아직 슬롯을 쥐고 있어 **사용자가 자기 분석 때문에 막힌다**(CONCURRENCY_LIMIT).
 *
 * 그래서 화면 job 하나에 서버 Job 하나를 고정하고, 다시 불리면 그 Job을 이어서 폴링한다.
 * 새 분석은 새 화면 job(새 업로드·캡처)에서만 시작된다.
 */
const serverJobByClientJob = new Map<string, Promise<string>>();

function serverJobFor(
  clientJobId: string,
  { file, source, width, height }: Omit<AnalyzeInput, "jobId" | "signal">,
  signal: AbortSignal,
): Promise<string> {
  const known = serverJobByClientJob.get(clientJobId);
  if (known) return known;

  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("source", source);
  formData.append("width", String(width));
  formData.append("height", String(height));

  const created = apiFetch<CreateJobResponse>(endpoints.analysis.jobs, {
    method: "POST",
    body: formData,
    auth: false,
    signal,
  })
    .then((job) => job.jobId)
    .catch((error) => {
      // 만들지 못했으면 슬롯도 잡히지 않았다. 다음 시도가 다시 만들 수 있게 지운다.
      serverJobByClientJob.delete(clientJobId);
      throw error;
    });

  serverJobByClientJob.set(clientJobId, created);
  return created;
}

/** 테스트에서 모듈 상태를 초기화한다. */
export function __resetAnalysisJobs(): void {
  serverJobByClientJob.clear();
}

export const poseHttp: PoseResultService = {
  /**
   * 저장된 결과만 읽는다. Job을 만들지 않으므로 `serverJobByClientJob` 맵도, 쿼터도,
   * 동시 분석 슬롯도 건드리지 않는다 — 기록을 열어보는 일이 분석 한도를 깎으면 안 된다.
   */
  async loadResult({ jobId, signal }): Promise<AnalysisResult> {
    let raw: BffAnalysisResult;
    try {
      raw = await apiFetch<BffAnalysisResult>(endpoints.analysis.result(jobId), {
        auth: false,
        signal,
      });
    } catch (error) {
      // 아직 끝나지 않았거나 결과가 비어 있는 Job. 목록이 완료 항목만 열어주므로
      // 보통은 오지 않지만, 목록을 받은 뒤 상태가 바뀌면 도달할 수 있다.
      if (error instanceof ApiError && error.code === "NOT_READY") {
        throw new AnalysisError("NOT_READY", "아직 결과가 준비되지 않은 작업입니다.");
      }
      throw error;
    }
    return toAnalysisResult(raw, signal ?? new AbortController().signal);
  },

  async analyze({
    jobId,
    file,
    source,
    width,
    height,
    signal: parentSignal,
  }): Promise<AnalysisResult> {
    const timeout = createAnalysisDeadline(parentSignal);

    try {
      const serverJobId = await serverJobFor(
        jobId,
        { file, source, width, height },
        timeout.createSignal,
      );
      const result = await waitForResult(serverJobId, timeout.deadline, timeout.signal);
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
