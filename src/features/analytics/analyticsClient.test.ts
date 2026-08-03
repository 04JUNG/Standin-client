import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { safeStorage } from "@/shared/lib/safeStorage";
import { flushEvents, resetAnalyticsQueue, trackEvent } from "./analyticsClient";

const QUEUE_KEY = "standin.analytics.queue.v1";

type QueuedEvent = { eventId: string; name: string };

function queuedNames(): string[] {
  const raw = safeStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedEvent[]).map((event) => event.name) : [];
}

function sentNames(call: unknown[]): string[] {
  const body = JSON.parse((call[1] as RequestInit).body as string) as { events: QueuedEvent[] };
  return body.events.map((event) => event.name);
}

function accepted(): Response {
  return new Response(JSON.stringify({ accepted: 1, duplicates: 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function rejected(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: "nope" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 응답 시점을 테스트가 직접 잡는다. 전송 중에 벌어지는 일을 재현하기 위한 것이다. */
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("analyticsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetApiClient();
    resetAnalyticsQueue();
    setInstallationCredentials({ installationId: "inst_1", deviceToken: "device-token" });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAnalyticsQueue();
    __resetApiClient();
  });

  it("전송 중에 쌓인 이벤트를 덮어쓰지 않는다", async () => {
    const first = deferred<Response>();
    fetchMock.mockImplementationOnce(() => first.promise).mockImplementation(async () => accepted());

    // 첫 이벤트가 flush를 시작하고, 응답을 기다리는 사이에 두 번째가 큐에 들어간다.
    trackEvent("app_started", { locale: "ko-KR" });
    trackEvent("input_confirmed", { source: "file" });
    first.resolve(accepted());
    await flushEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentNames(fetchMock.mock.calls[0])).toEqual(["app_started"]);
    expect(sentNames(fetchMock.mock.calls[1])).toEqual(["input_confirmed"]);
    expect(queuedNames()).toEqual([]);
  });

  it("영구 거절된 배치는 버려서 뒤따르는 이벤트를 막지 않는다", async () => {
    // BFF는 모르는 jobId를 만나면 배치 전체를 404로 거절한다.
    fetchMock
      .mockImplementationOnce(async () => rejected(404, "NOT_FOUND"))
      .mockImplementation(async () => accepted());

    trackEvent("results_viewed", { surface: "app" }, "unknown-job");
    await flushEvents();
    expect(queuedNames()).toEqual([]);

    trackEvent("input_confirmed", { source: "capture" });
    await flushEvents();

    expect(sentNames(fetchMock.mock.calls[1])).toEqual(["input_confirmed"]);
    expect(queuedNames()).toEqual([]);
  });

  it("네트워크 실패는 큐를 남겨 다음 기회에 다시 보낸다", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("offline");
    });

    trackEvent("app_started", { locale: "ko-KR" });
    await flushEvents();
    expect(queuedNames()).toEqual(["app_started"]);

    fetchMock.mockImplementation(async () => accepted());
    await flushEvents();

    expect(queuedNames()).toEqual([]);
  });

  it("5xx도 재시도 대상이라 큐에 남는다", async () => {
    fetchMock.mockImplementation(async () => rejected(503, "UPSTREAM_UNAVAILABLE"));

    trackEvent("app_started", { locale: "ko-KR" });
    await flushEvents();

    expect(queuedNames()).toEqual(["app_started"]);
  });
});
