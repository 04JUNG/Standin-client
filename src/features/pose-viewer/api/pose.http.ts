import { rememberAnalysisFailure } from "@/features/analytics/analysisContext";
import { featureAction, failureProperties } from "@/features/analytics/featureJourney";
import { rememberJobSource } from "@/features/analytics/analyticsClient";
import { readSceneSaveContract } from "@/features/export/api/scene";
import { semanticCandidateSchema, semanticResultSchema } from "@/features/semantic-search/api";
import { selectionSchema } from "@/features/body-selection/contract";
import { readOutputScope } from "./outputScope";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { endpoints } from "@/shared/api/endpoints";
import { AnalysisError } from "./pose.contract";
import type {
  AnalysisResult,
  CoverageClass,
  FallbackMode,
  MatchLevel,
  PersonConfidence,
  PersonBox,
  PersonResult,
  PoseCandidate,
  PoseResultService,
  SkeletonSource,
  SkeletonState,
} from "./pose.contract";

import { upstreamAnalysisFailure } from "@/shared/api/analysisJobFailure";

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

import { validRotation } from "../preview/modelContract";

import {
  readCandidatePolicy,
  canRefineCandidate,
  canRelease,
  type CandidatePolicy,
  type RoutedSearch,
} from "./routedSearch";

type BffCandidate = CandidatePolicy & {
  semantic?: unknown;
  id: string;
  poseId: string | null;
  rank: number;
  view: string;
  tags: string[];
  matchLevel: MatchLevel;
  bvhAvailable: boolean;
  thumbnailUrl?: string;
  posterUrl?: string;
  quickThumbnailUrl?: string;
  previewModelUrl?: string;
  camera?: { version?: string; rotation?: unknown; source_bvh_sha256?: string } | null;
};

type BffAnalysisResult = {
  source?: "image" | "semantic";
  semantic?: unknown;
  jobId: string;
  notes: string[];
  /** 입력 원본의 presigned URL. 보관 기간(90일)이 지났거나 구 BFF면 없다. */
  inputUrl?: string | null;
  /** 구 BFF에는 없다. 없으면 refine을 노출하지 않는다. */
  capabilities?: {
    handSelection?: boolean;
    refine?: boolean;
    fbxExport?: boolean;
    sceneExport?: boolean;
    sceneRefinement?: boolean;
    sceneSaveContract?: unknown;
    characterSelection?: boolean;
    bodyPreviews?: boolean;
    presentationBodyPreviews?: boolean;
    semanticBodySelection?: boolean;
    bodyPreviewAssets?: boolean;
    outputScopeSelection?: boolean;
    outputScopeCropping?: boolean;
    modelPreview?: boolean;
    candidateRerun?: boolean;
  };
  candidatesByPerson: Array<{
    posePresentation?: import("./posePresentation").PosePresentation;
    routedSearch?: RoutedSearch;
    bodySelection?: unknown;
    bodyPreviewManifestUrl?: string;
    personIndex: number;
    outputScope?: unknown;
    candidateShortfallReason?: string | null;
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
  "upper_only",
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

function validSemanticThumbnail(url: string, poseId: string): boolean {
  const [path, query, extra] = url.split("?");
  if (
    path !== `/v1/pose-candidates/${encodeURIComponent(poseId)}/thumbnail` ||
    !query ||
    extra !== undefined ||
    url.includes("#")
  )
    return false;
  const params = new URLSearchParams(query);
  const entries = [...params.entries()];
  return (
    params.getAll("view").length === 1 &&
    params.get("view") === "front" &&
    params.getAll("revision").length <= 1 &&
    entries.every(
      ([key, value]) => key === "view" || (key === "revision" && /^[a-f0-9]{7,64}$/.test(value)),
    )
  );
}

async function toPoseCandidate(
  raw: BffCandidate,
  jobId: string,
  personIndex: number,
  signal: AbortSignal,
  posterScope: import("./outputScope").BodyScope = "full",
): Promise<PoseCandidate> {
  const semantic =
    raw.semantic === undefined ? undefined : semanticCandidateSchema.parse(raw.semantic);
  if (semantic && raw.thumbnailUrl && !validSemanticThumbnail(raw.thumbnailUrl, raw.poseId ?? ""))
    throw new ApiError(502, "SEMANTIC_CONTRACT", "invalid thumbnail path");
  const deferred = !!raw.camera && !!raw.thumbnailUrl;
  // Do not fetch aligned images or wait for all 20 thumbnails before returning
  // search results. Visible cards load their source-bound static poster lazily.
  signal.throwIfAborted();
  const thumbnailUrl = "";
  const policy = readCandidatePolicy(raw);
  if (
    policy.refineAllowed === true &&
    (raw.camera?.version !== "candidate-camera-v2" ||
      !validRotation(raw.camera.rotation) ||
      raw.camera.source_bvh_sha256 !== policy.sourceBvhSha256)
  )
    policy.refineAllowed = false;
  const downloadable =
    canRelease({ ...policy, bvhAvailable: raw.bvhAvailable } as PoseCandidate) &&
    raw.bvhAvailable &&
    (policy.source === "generation"
      ? raw.poseId === null
      : typeof raw.poseId === "string" && !!raw.poseId);
  const posterParams = new URLSearchParams({
    jobId,
    personIndex: String(personIndex),
    candidateId: raw.id,
  });
  return {
    ...policy,
    id: raw.id,
    poseId: raw.poseId,
    rank: raw.rank,
    ...(semantic ? { semantic } : {}),
    title: semantic
      ? semantic.description || `포즈 ${raw.rank}`
      : raw.source === "generation"
        ? `새로 만든 포즈 ${raw.rank}`
        : raw.source === "library"
          ? `포즈 ${raw.rank}`
          : `포즈 ${raw.id}`,
    tags: raw.tags,
    matchLevel: raw.matchLevel,
    thumbnailUrl,
    posterScope,
    ...(policy.source === "generation" && raw.poseId === null
      ? {
          posterUrl: `/v1/analysis/jobs/${encodeURIComponent(jobId)}/people/${personIndex}/pose-previews/${encodeURIComponent(raw.id)}/${policy.sourceBvhSha256}/poster`,
        }
      : {}),
    ...(raw.poseId
      ? {
          posterUrl: `/v1/pose-candidates/${encodeURIComponent(raw.poseId)}/poster?${posterParams}`,
        }
      : {}),
    ...(deferred ? { deferredThumbnailUrl: raw.thumbnailUrl } : {}),
    ...(raw.quickThumbnailUrl || (!deferred && raw.thumbnailUrl)
      ? {
          quickThumbnailUrl: raw.quickThumbnailUrl || raw.thumbnailUrl,
        }
      : {}),
    ...(deferred &&
    raw.previewModelUrl &&
    validRotation(raw.camera?.rotation) &&
    /^[a-f0-9]{64}$/.test(raw.camera?.source_bvh_sha256 ?? "")
      ? {
          previewModel: {
            url: raw.previewModelUrl,
            rotation: raw.camera!.rotation as number[][],
            sourceSha: raw.camera!.source_bvh_sha256!,
          },
        }
      : {}),
    previewImages: thumbnailUrl ? [{ view: raw.view, url: thumbnailUrl }] : [],
    modelUrl: null,
    bvhAvailable: downloadable,
    bvhUrl: downloadable
      ? endpoints.poseCandidates.export(raw.poseId ?? raw.id, jobId, personIndex, raw.id)
      : undefined,
  };
}

/** 네 값이 모두 유한하고 넓이가 있는 상자만 받는다. 아니면 없는 것으로 본다. */
export function readPersonBox(value: unknown): PersonBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  const [x1, y1, x2, y2] = value as number[];
  return x2 > x1 && y2 > y1 ? [x1, y1, x2, y2] : null;
}

async function toAnalysisResult(
  raw: BffAnalysisResult,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  const semantic = raw.source === "semantic" ? semanticResultSchema.parse(raw.semantic) : undefined;
  if (
    semantic &&
    raw.candidatesByPerson.some(
      (p) =>
        p.refineAllowed !== false ||
        p.candidates.some((c) => !semanticCandidateSchema.safeParse(c.semantic).success),
    )
  )
    throw new ApiError(502, "SEMANTIC_CONTRACT", "invalid semantic candidates");
  const people: PersonResult[] = await Promise.all(
    raw.candidatesByPerson.map(async (person) => {
      const confidence = narrow(CONFIDENCE, person.confidence, "low");
      const candidates = await Promise.all(
        person.candidates.map((candidate) =>
          toPoseCandidate(
            candidate,
            raw.jobId,
            person.personIndex,
            signal,
            readOutputScope(person.outputScope).resolved,
          ),
        ),
      );
      return {
        // 서버 personIndex를 그대로 쓴다. 화면에서 탐지 순서로 다시 번호를 매기지 않는다.
        index: person.personIndex,
        posePresentation: person.posePresentation,
        routedSearch: person.routedSearch,
        bodySelection: selectionSchema.safeParse(person.bodySelection).success
          ? selectionSchema.parse(person.bodySelection)
          : undefined,
        bodyPreviewManifestUrl: person.bodyPreviewManifestUrl,
        outputScope: readOutputScope(person.outputScope),
        candidateShortfallReason: person.candidateShortfallReason ?? null,
        box: readPersonBox(person.box),
        candidates,
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
        refineAllowed: person.refineAllowed === true && candidates.some(canRefineCandidate),
        refinableLimbs: person.refinableLimbs ?? [],
      } satisfies PersonResult;
    }),
  );

  if (people.length === 0) {
    throw new AnalysisError("NO_PEOPLE", "이미지에서 인물을 찾지 못했습니다.");
  }

  return {
    jobId: raw.jobId,
    ...(semantic ? { source: "semantic" as const, semantic } : {}),
    // 라이브 분석에서도 원본 미리보기가 draft의 blob URL에 의존하지 않게 된다.
    inputPreviewUrl: raw.inputUrl ?? undefined,
    people,
    capabilities: {
      handSelection: raw.capabilities?.handSelection === true,
      presentationBodyPreviews: raw.capabilities?.presentationBodyPreviews === true,
      semanticBodySelection: !!semantic && raw.capabilities?.semanticBodySelection === true,
      bodyPreviews:
        (!semantic || people.some((p) => p.candidates.some((c) => c.manualExportAllowed))) &&
        raw.capabilities?.bodyPreviews === true,
      bodyPreviewAssets:
        (!semantic || people.some((p) => p.candidates.some((c) => c.manualExportAllowed))) &&
        raw.capabilities?.bodyPreviewAssets === true,
      refine: !semantic && raw.capabilities?.refine === true,
      // 구버전 BFF에는 이 필드가 없다. 없으면 FBX를 노출하지 않는 쪽으로 좁힌다.
      fbxExport: raw.capabilities?.fbxExport === true,
      ...(raw.capabilities?.sceneRefinement === true
        ? {
            sceneRefinement:
              !semantic &&
              !people.some((p) => p.candidates.some((c) => c.source === "generation")) &&
              raw.capabilities?.sceneExport === true,
          }
        : {}),
      sceneSaveContract: readSceneSaveContract(raw.capabilities?.sceneSaveContract),
      sceneExport:
        !semantic &&
        !people.some((p) => p.candidates.some((c) => c.source === "generation")) &&
        raw.capabilities?.sceneExport === true,
      // 같은 이유로 모델 선택도 명시적으로 켜졌을 때만 켠다. 없으면 파라미터를 붙이지
      // 않아 이 기능이 없던 때와 바이트까지 같은 파일이 나온다.
      characterSelection: raw.capabilities?.characterSelection === true,
      outputScopeSelection: raw.capabilities?.outputScopeSelection === true,
      outputScopeCropping: raw.capabilities?.outputScopeCropping === true,
      modelPreview: raw.capabilities?.modelPreview === true,
      candidateRerun: raw.capabilities?.candidateRerun === true,
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
      const upstream = upstreamAnalysisFailure(job.error);
      if (upstream) throw new AnalysisError(upstream.code, upstream.message);
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

  const attemptId = crypto.randomUUID();
  const startedAt = Date.now();
  featureAction("analysis", "upload_started", undefined, {
    attemptId,
    inputId: clientJobId,
    source,
    phase: "upload",
  });
  const created = apiFetch<CreateJobResponse>(endpoints.analysis.jobs, {
    method: "POST",
    body: formData,
    auth: false,
    signal,
  })
    .then((job) => {
      rememberJobSource(job.jobId, source);
      featureAction("analysis", "upload_completed", job.jobId, {
        attemptId,
        inputId: clientJobId,
        source,
        phase: "upload",
        elapsedMs: Date.now() - startedAt,
      });
      return job.jobId;
    })
    .catch((error) => {
      // 만들지 못했으면 슬롯도 잡히지 않았다. 다음 시도가 다시 만들 수 있게 지운다.
      featureAction("analysis", signal.aborted ? "cancelled" : "upload_failed", undefined, {
        attemptId,
        inputId: clientJobId,
        source,
        phase: "upload",
        elapsedMs: Date.now() - startedAt,
        ...(!signal.aborted ? failureProperties(error, "analysis") : {}),
      });
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
    let knownServerJobId: string | undefined;

    try {
      const serverJobId = await serverJobFor(
        jobId,
        { file, source, width, height },
        timeout.createSignal,
      );
      knownServerJobId = serverJobId;
      const result = await waitForResult(serverJobId, timeout.deadline, timeout.signal);
      const analysis = await toAnalysisResult(result, timeout.signal);
      if (timeout.signal.aborted) throw timeout.signal.reason;
      return analysis;
    } catch (error) {
      const failure = timeout.didTimeOut() ? analysisTimeoutError() : error;
      rememberAnalysisFailure(failure, knownServerJobId);
      throw failure;
    } finally {
      timeout.dispose();
    }
  },
};
