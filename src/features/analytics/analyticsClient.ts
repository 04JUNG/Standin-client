import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { endpoints } from "@/shared/api/endpoints";
import { safeStorage } from "@/shared/lib/safeStorage";
import type { UploadDraft } from "@/shared/types/upload";

type EventName =
  | "app_started"
  | "input_confirmed"
  | "results_viewed"
  | "candidate_selected"
  | "selection_confirmed"
  | "analysis_failed"
  | "rerun_requested"
  | "export_completed"
  | "export_failed"
  | "capture_failed";

/** 앱 창인지 플로팅 바인지(ADR-008). 두 표면의 사용 비율이 핵심 지표라 모든 흐름 이벤트에 붙인다. */
export type Surface = "app" | "bar";

export function currentSurface(): Surface {
  return window.location.pathname.startsWith("/bar") ? "bar" : "app";
}

interface QueuedEvent {
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

function readQueue(): QueuedEvent[] {
  try {
    const parsed = JSON.parse(safeStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]).slice(-MAX_QUEUE) : [];
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
  const queue = readQueue();
  queue.push({
    eventId: `evt_${crypto.randomUUID()}`,
    sequence: nextSequence(),
    name,
    occurredAt: new Date().toISOString(),
    jobId,
    properties,
  });
  writeQueue(queue);
  void flushEvents();
}

export function flushEvents(): Promise<void> {
  if (inflight) return inflight;
  // 제한에 걸린 동안은 조용히 쉰다. 큐는 그대로 남아 다음 기회에 나간다(at-least-once).
  if (Date.now() < retryAfterMs) return Promise.resolve();
  inflight = (async () => {
    let queue = readQueue();
    while (queue.length > 0) {
      const generation = queueGeneration;
      const batch = queue.slice(0, BATCH_SIZE);
      try {
        await apiFetch(endpoints.events.batch, {
          method: "POST",
          auth: false,
          body: { events: batch },
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
export function trackInputConfirmed(draft: UploadDraft): void {
  trackEvent("input_confirmed", {
    source: draft.source,
    width: draft.width,
    height: draft.height,
    size: draft.sizeBytes ?? 0,
    mime: draft.file?.type ?? draft.mimeType,
    surface: currentSurface(),
  });
}

/**
 * "다시 검색"을 누른 시점. 서버 연동은 후속이지만 **누르려 했다는 사실 자체**가
 * 후보 불만족의 신호다. 저장까지 가지 않은 사용자에게서 얻을 수 있는 거의 유일한
 * 품질 신호라 서버 rerun 구현과 무관하게 지금 남긴다.
 */
export function trackRerunRequested(
  jobId: string | undefined,
  counts: { selectedCount: number; peopleCount: number },
): void {
  trackEvent("rerun_requested", { ...counts, surface: currentSurface() }, jobId);
}

export async function confirmSelections(
  jobId: string,
  selections: Array<{ personIndex: number; candidateId: string }>,
): Promise<void> {
  await apiFetch(endpoints.analysis.selections(jobId), {
    method: "PUT",
    auth: false,
    body: { selections },
  });
  trackEvent("selection_confirmed", { selectionCount: selections.length }, jobId);
}

export async function submitFeedback(jobId: string, reason: string): Promise<void> {
  await apiFetch(endpoints.analysis.feedback(jobId), {
    method: "POST",
    auth: false,
    body: { reason },
  });
}
