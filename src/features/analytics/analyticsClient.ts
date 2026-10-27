import { failureProperties } from "./failureProperties";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { safeStorage } from "@/shared/lib/safeStorage";
import type { UploadDraft } from "@/shared/types/upload";
import { analyticsService } from "./api/analytics.service";

type JourneyEventName =
  | "review_viewed"
  | "preparation_started"
  | "preparation_ready"
  | "preparation_failed"
  | "export_requested"
  | "export_cancelled"
  | "thumbnail_failed"
  | "input_started"
  | "input_cancelled"
  | "input_failed";

type EventName =
  | "feature_action"
  | "journey_exit"
  | "selection_failed"
  | JourneyEventName
  | "app_started"
  | "input_confirmed"
  | "results_viewed"
  | "candidate_selected"
  | "selection_confirmed"
  | "analysis_failed"
  | "export_completed"
  | "export_failed"
  | "capture_failed"
  // 자동 업데이트 계열(ADR-011). BFF의 허용 목록에 먼저 올라가 있어야 한다 —
  // 모르는 이름이 섞이면 서버가 배치 전체를 400으로 거절하고, 아래 4xx 처리가
  // 그 배치를 버려 같이 실린 이벤트까지 사라진다.
  | "update_check"
  | "update_installed"
  | "update_failed";

/** 앱 창인지 플로팅 바인지(ADR-008). 두 표면의 사용 비율이 핵심 지표라 모든 흐름 이벤트에 붙인다. */
export type Surface = "app" | "bar";

export function currentSurface(): Surface {
  return window.location.pathname.startsWith("/bar") ? "bar" : "app";
}

interface QueuedEvent {
  qualityConsentId: string;
  eventId: string;
  sequence: number;
  name: EventName;
  occurredAt: string;
  jobId?: string;
  properties: Record<string, string | number | boolean | null>;
}

const QUEUE_KEY = "standin.analytics.queue.v1";
const SEQUENCE_KEY = "standin.analytics.sequence.v1";
/** BFF의 `/v1/events/batch`가 한 번에 받는 최대 개수. */
const BATCH_SIZE = 100;
/** 오프라인이 길어져도 저장소를 무한히 채우지 않는다. 넘치면 오래된 것부터 버린다. */
const MAX_QUEUE = 500;
/** 서버가 Retry-After를 주지 않은 429의 대기 시간. */
const DEFAULT_BACKOFF_SECONDS = 60;
let inflight: Promise<void> | null = null;
let queueGeneration = 0;
let qualityConsentId: string | null = null;
let consentNotBeforeMs = 0;
let journeyEnabled: boolean | undefined;
let featureUsageEnabled: boolean | undefined;
const featureNames = new Set(["feature_action", "journey_exit", "selection_failed"]);
export function currentOsName() {
  const platform = navigator.platform.toLowerCase();
  return platform.includes("mac")
    ? "macos"
    : platform.includes("win")
      ? "windows"
      : platform.includes("linux")
        ? "linux"
        : "unknown";
}
let capabilityGeneration = 0;
let sessionId = crypto.randomUUID();
export function analyticsConsentId() {
  return qualityConsentId;
}
const consentListeners = new Set<() => void>();
export function subscribeAnalyticsConsent(listener: () => void) {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}
const jobSources = new Map<string, string>();
export function rememberJobSource(jobId: string, source: string) {
  if (source !== "unknown" || !jobSources.has(jobId)) jobSources.set(jobId, source);
  if (jobSources.size > 100) jobSources.delete(jobSources.keys().next().value!);
}

const journeyNames = new Set<string>([
  "review_viewed",
  "preparation_started",
  "preparation_ready",
  "preparation_failed",
  "export_requested",
  "export_cancelled",
  "thumbnail_failed",
  "input_started",
  "input_cancelled",
  "input_failed",
]);

/** New clients must not poison a legacy server's entire event batch with unknown names. */
let capabilityRequest: Promise<void> | null = null;
let capabilityRetryAt = 0;
export function refreshJourneyCapability(): Promise<void> {
  if (capabilityRequest) return capabilityRequest;
  const generation = ++capabilityGeneration;
  journeyEnabled = undefined;
  featureUsageEnabled = undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  capabilityRequest = (async () => {
    try {
      const capability = await apiFetch<{ journeyVersion?: number; featureUsageVersion?: number }>(
        "/v1/events/capabilities",
        {
          auth: false,
          signal: controller.signal,
        },
      );
      if (generation === capabilityGeneration) {
        journeyEnabled = capability.journeyVersion === 2;
        featureUsageEnabled = journeyEnabled && (capability.featureUsageVersion ?? 0) >= 1;
      }
    } catch (error) {
      if (generation === capabilityGeneration) {
        // Offline/5xx is not evidence that the server does not support v2.
        if (error instanceof ApiError && error.status === 404) {
          journeyEnabled = false;
          featureUsageEnabled = false;
        } else capabilityRetryAt = Date.now() + 30_000;
      }
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => {
    if (generation !== capabilityGeneration) return;
    capabilityRequest = null;
    if (journeyEnabled !== undefined) void flushEvents();
  });
  return capabilityRequest;
}

export function resetJourneyCapability(): void {
  capabilityGeneration += 1;
  capabilityRequest = null;
  capabilityRetryAt = 0;
  journeyEnabled = undefined;
  featureUsageEnabled = undefined;
  sessionId = crypto.randomUUID();
}

export function setAnalyticsConsent(consentId: string | null, grantedAt?: string | null): void {
  if (!consentId || (qualityConsentId && qualityConsentId !== consentId)) {
    for (const source of ["capture", "file", "clipboard", "semantic"])
      safeStorage.removeItem(inputAttemptKey(source));
  }
  if (!consentId || (qualityConsentId !== null && qualityConsentId !== consentId)) {
    resetAnalyticsQueue();
    safeStorage.removeItem("standin.analytics.feature-usage.v1");
    jobSources.clear();
  }
  qualityConsentId = consentId;
  const grantedAtMs = grantedAt ? Date.parse(grantedAt) : 0;
  consentNotBeforeMs = consentId && Number.isFinite(grantedAtMs) ? grantedAtMs : 0;
  // A fresh webview may restore the same consent; retain only its persisted events.
  if (consentId) writeQueue(readQueue());
  consentListeners.forEach((listener) => listener());
}

function readQueue(): QueuedEvent[] {
  try {
    const parsed = JSON.parse(safeStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? (parsed as QueuedEvent[])
          .filter((event) => event.qualityConsentId === qualityConsentId)
          .slice(-MAX_QUEUE)
      : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  safeStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

/**
 * 방금 보낸 배치만 큐에서 덜어낸다.
 *
 * 전송 직전의 스냅샷으로 큐를 통째로 덮어쓰면, 요청이 오가는 동안 `trackEvent`가
 * 쌓은 이벤트가 조용히 사라진다. 저장소를 다시 읽어 eventId로 지워야 한다.
 */
function dropSent(batch: QueuedEvent[]): QueuedEvent[] {
  const sent = new Set(batch.map((event) => event.eventId));
  const remaining = readQueue().filter((event) => !sent.has(event.eventId));
  writeQueue(remaining);
  return remaining;
}

/**
 * 다시 보내도 같은 답이 올 거절인지.
 *
 * BFF는 배치 안에 잘못된 이벤트가 하나라도 있으면 **배치 전체**를 400으로,
 * 모르는 jobId면 404로 거절한다(analytics/routes.ts). 이런 배치를 큐에 남겨두면
 * 이후 모든 이벤트가 그 뒤에 막혀 로그가 영구히 멈춘다. 4xx는 버리고 넘어간다.
 * 429는 잠시 뒤 다시 받아주므로 남긴다.
 */
function isPermanentRejection(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429;
}

/**
 * 429를 받으면 이 시각까지 전송을 쉰다.
 *
 * `trackEvent`가 이벤트마다 flush를 부르므로 backoff가 없으면 제한에 걸린 동안
 * 이벤트 수만큼 요청을 계속 던진다 — 제한을 풀어야 할 때 오히려 더 때리는 셈이다.
 */
let retryAfterMs = 0;

/** 서버가 준 Retry-After를 따르고, 없으면 짧은 기본값을 쓴다. */
function pauseFrom(err: unknown): void {
  if (!(err instanceof ApiError) || err.status !== 429) return;
  const seconds = err.retryAfterSeconds ?? DEFAULT_BACKOFF_SECONDS;
  retryAfterMs = Date.now() + seconds * 1000;
}

function nextSequence(): number {
  const current = Number(safeStorage.getItem(SEQUENCE_KEY) ?? "0");
  const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
  safeStorage.setItem(SEQUENCE_KEY, String(next));
  return next;
}

export function trackEvent(
  name: EventName,
  properties: QueuedEvent["properties"],
  jobId?: string,
): void {
  if (
    !qualityConsentId ||
    (featureNames.has(name) && featureUsageEnabled === false) ||
    ((journeyNames.has(name) || properties.telemetryVersion === 2) && journeyEnabled === false)
  )
    return;
  const queue = readQueue();
  queue.push({
    qualityConsentId,
    eventId: `evt_${crypto.randomUUID()}`,
    sequence: nextSequence(),
    name,
    // A slightly slow device clock must not date a newly collected event before its server grant.
    // Existing queued events are never retimestamped or moved to another consent ID.
    occurredAt: new Date(Math.max(Date.now(), consentNotBeforeMs)).toISOString(),
    jobId,
    properties: {
      ...(jobId && jobSources.has(jobId) ? { source: jobSources.get(jobId)! } : {}),
      ...properties,
      ...(journeyEnabled !== false
        ? {
            telemetryVersion: 2,
            sessionId,
            appVersion: import.meta.env.VITE_APP_VERSION || "unknown",
            surface: properties.surface ?? currentSurface(),
            osName: currentOsName(),
          }
        : {}),
    },
  });
  writeQueue(queue);
  void flushEvents();
}

export function suspendAnalyticsConsent(): void {
  queueGeneration += 1;
  qualityConsentId = null;
  consentNotBeforeMs = 0;
  consentListeners.forEach((listener) => listener());
}

export function flushEvents(): Promise<void> {
  // Explicit withdrawal clears synchronously in setAnalyticsConsent(null).
  // Unverified bootstrap/offline state pauses without destroying consent-scoped history.
  if (!qualityConsentId) return Promise.resolve();
  // Capability negotiation must finish before draining an offline v2 queue.
  if (journeyEnabled === undefined) {
    if (Date.now() >= capabilityRetryAt) void refreshJourneyCapability();
    return Promise.resolve();
  }
  if (inflight) return inflight;
  // 제한에 걸린 동안은 조용히 쉰다. 큐는 그대로 남아 다음 기회에 나간다(at-least-once).
  if (Date.now() < retryAfterMs) return Promise.resolve();
  inflight = (async () => {
    let queue = readQueue();
    if (!journeyEnabled || featureUsageEnabled === false) {
      const unsupported = queue.filter(
        (event) =>
          (!journeyEnabled && journeyNames.has(event.name)) ||
          (featureUsageEnabled === false && featureNames.has(event.name)),
      );
      if (unsupported.length) queue = dropSent(unsupported);
    }
    while (queue.length > 0) {
      const generation = queueGeneration;
      const batch = queue.slice(0, BATCH_SIZE);
      try {
        await analyticsService.sendEvents({
          events: batch,
          qualityConsentId: batch[0].qualityConsentId,
        });
      } catch (err) {
        // 동의 철회 등으로 큐가 비워졌으면 그 뒤 상태를 건드리지 않는다.
        if (generation !== queueGeneration) return;
        // 네트워크·5xx는 다음 기회에 그대로 다시 보낸다(at-least-once).
        if (!isPermanentRejection(err)) {
          pauseFrom(err);
          return;
        }
        // 영구 거절은 배치를 버려야 큐가 다시 흐른다. 어느 이벤트가 문제인지
        // 서버가 알려주지 않으므로 같이 묶인 정상 이벤트도 함께 버린다.
        queue = dropSent(batch);
        continue;
      }
      if (generation !== queueGeneration) return;
      queue = dropSent(batch);
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function resetAnalyticsQueue(): void {
  queueGeneration += 1;
  // 새 설치는 새 IP 버킷·새 큐다. 이전 설치가 걸어둔 대기를 물려받지 않는다.
  retryAfterMs = 0;
  safeStorage.removeItem(QUEUE_KEY);
  safeStorage.removeItem(SEQUENCE_KEY);
}

/**
 * 분석 입력 확정. 앱 모드(InputPreviewPage)와 바 모드(BarProgressPage) 두 곳에서 흐름이
 * 시작되므로 한 함수로 묶는다. 한쪽만 빠지면 그 표면의 퍼널에 분모가 사라진다.
 *
 * 서버 jobId는 아직 없다(분석 요청 전). 클라 라우팅용 jobId를 실으면 서버가 모르는
 * job이라 배치 전체가 거절되므로 job에 연결하지 않는다.
 */
const inputAttemptKey = (source: string) => `standin.analytics.input-attempt.v1.${source}`;
function readInputAttempt(
  source: string,
): { attemptId: string; surface: Surface; startedAt: number } | undefined {
  try {
    const value = JSON.parse(safeStorage.getItem(inputAttemptKey(source)) ?? "null");
    if (
      value?.consentId === qualityConsentId &&
      typeof value.attemptId === "string" &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(value.attemptId) &&
      (value.surface === "app" || value.surface === "bar") &&
      typeof value.startedAt === "number" &&
      Date.now() - value.startedAt >= 0 &&
      Date.now() - value.startedAt < 30 * 60_000
    )
      return value;
  } catch {
    /* A corrupt/expired pending attempt is not an input failure. */
  }
  return undefined;
}
export function startInputAttempt(source: string, surface: Surface = currentSurface()): string {
  const attemptId = crypto.randomUUID();
  if (qualityConsentId) {
    safeStorage.setItem(
      inputAttemptKey(source),
      JSON.stringify({ attemptId, surface, startedAt: Date.now(), consentId: qualityConsentId }),
    );
    trackEvent("input_started", { source, attemptId, surface });
  }
  return attemptId;
}
export function finishInputAttempt(
  source: string,
  outcome: "cancelled" | "failed",
  code?: string,
  error?: unknown,
): void {
  const attempt = readInputAttempt(source);
  if (!attempt) return;
  trackEvent(outcome === "cancelled" ? "input_cancelled" : "input_failed", {
    source,
    attemptId: attempt.attemptId,
    surface: attempt.surface,
    elapsedMs: Math.max(0, Date.now() - attempt.startedAt),
    ...(outcome === "failed"
      ? failureProperties(
          error ?? { code },
          source === "capture" ? "capture" : source === "clipboard" ? "clipboard" : "file_input",
        )
      : {}),
    ...(code ? { code } : {}),
  });
  safeStorage.removeItem(inputAttemptKey(source));
}
export function ensureInputAttempt(source: string, surface?: Surface): void {
  if (!readInputAttempt(source)) startInputAttempt(source, surface);
}

export function trackInputConfirmed(
  draft: UploadDraft,
  /**
   * 이 입력을 어떤 체형으로 저장할 예정인가. 새 이벤트 이름을 만들지 않고 속성으로 붙인다 —
   * EventName은 서버 allowlist라 모르는 이름은 배치 전체가 거절되고 그 배치가 버려진다.
   */
  characterId?: string | null,
): void {
  const attempt = readInputAttempt(draft.source);
  trackEvent("input_confirmed", {
    source: draft.source,
    inputAttemptId: readInputAttempt(draft.source)?.attemptId ?? null,
    inputId: draft.id,
    ...(attempt ? { elapsedMs: Math.max(0, Date.now() - attempt.startedAt) } : {}),
    characterId: characterId ?? "default",
    width: draft.width,
    height: draft.height,
    size: draft.sizeBytes ?? 0,
    mime: draft.file?.type ?? draft.mimeType,
    surface: currentSurface(),
  });
  safeStorage.removeItem(inputAttemptKey(draft.source));
}

export async function confirmSelections(
  jobId: string,
  selections: Array<{ personIndex: number; candidateId: string }>,
): Promise<void> {
  try {
    await analyticsService.confirmSelections({ jobId, selections });
  } catch (error) {
    trackEvent(
      "selection_failed",
      { ...failureProperties(error, "pose_selection"), phase: "selection" },
      jobId,
    );
    throw error;
  }
  trackEvent("selection_confirmed", { selectionCount: selections.length }, jobId);
}

export async function submitFeedback(jobId: string, reason: string): Promise<void> {
  if (!qualityConsentId) throw new Error("품질 검토 동의가 필요합니다.");
  await analyticsService.submitFeedback({ jobId, reason, qualityConsentId });
}
