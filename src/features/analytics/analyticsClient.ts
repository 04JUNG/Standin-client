import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { safeStorage } from "@/shared/lib/safeStorage";

type EventName =
  | "app_started"
  | "input_confirmed"
  | "results_viewed"
  | "candidate_selected"
  | "selection_confirmed";

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
let inflight: Promise<void> | null = null;
let queueGeneration = 0;

function readQueue(): QueuedEvent[] {
  try {
    const parsed = JSON.parse(safeStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]).slice(-500) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  safeStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-500)));
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
  inflight = (async () => {
    let queue = readQueue();
    while (queue.length > 0) {
      try {
        const generation = queueGeneration;
        await apiFetch(endpoints.events.batch, {
          method: "POST",
          auth: false,
          body: { events: queue.slice(0, 100) },
        });
        if (generation !== queueGeneration) return;
        writeQueue(queue.slice(100));
        queue = readQueue();
      } catch {
        // At-least-once delivery: retain the sanitized queue for the next online request.
        return;
      }
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function resetAnalyticsQueue(): void {
  queueGeneration += 1;
  safeStorage.removeItem(QUEUE_KEY);
  safeStorage.removeItem(SEQUENCE_KEY);
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
