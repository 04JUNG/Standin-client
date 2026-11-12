import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { safeStorage } from "@/shared/lib/safeStorage";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
vi.mock("./api/analytics.service", async () => ({
  analyticsService: (await import("./api/analytics.http")).analyticsHttp,
}));
import {
  trackEvent,
  setAnalyticsConsent,
  suspendAnalyticsConsent,
  resetAnalyticsQueue,
  resetJourneyCapability,
  refreshJourneyCapability,
  flushEvents,
  startInputAttempt,
  finishInputAttempt,
} from "./analyticsClient";
const key = "standin.analytics.queue.v1";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetApiClient();
  resetAnalyticsQueue();
  resetJourneyCapability();
  setAnalyticsConsent("consent");
  setInstallationCredentials({ installationId: "installation", deviceToken: "token" });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetAnalyticsQueue();
  __resetApiClient();
});
it("old server never receives new names, while legacy events still drain", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: { code: "NOT_FOUND", message: "" } }, 404));
  await refreshJourneyCapability();
  fetchMock.mockResolvedValue(response({ accepted: 1 }));
  trackEvent("review_viewed", {}, "job_1");
  trackEvent("app_started", {});
  await flushEvents();
  const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(sent.events.map((e: { name: string }) => e.name)).toEqual(["app_started"]);
  expect(sent.events[0].properties.telemetryVersion).toBeUndefined();
});
it("pending capability probe preserves offline new events and then sends them once", async () => {
  safeStorage.setItem(
    key,
    JSON.stringify([
      {
        qualityConsentId: "consent",
        eventId: "evt-old",
        sequence: 1,
        name: "review_viewed",
        occurredAt: new Date().toISOString(),
        jobId: "job_1",
        properties: { telemetryVersion: 2 },
      },
    ]),
  );
  let finish!: (r: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((r) => {
        finish = r;
      }),
  );
  const probe = refreshJourneyCapability();
  trackEvent("app_started", {});
  await flushEvents();
  expect(JSON.parse(safeStorage.getItem(key)!)).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValue(response({ accepted: 2 }));
  finish(response({ journeyVersion: 2 }));
  await probe;
  await flushEvents();
  const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(sent.events.map((e: { name: string }) => e.name)).toEqual([
    "review_viewed",
    "app_started",
  ]);
  expect(JSON.parse(safeStorage.getItem(key)!)).toEqual([]);
});
it("v2 adds actual build/session/surface metadata and still respects consent withdrawal", async () => {
  vi.stubEnv("VITE_APP_VERSION", "0.2.4-test");
  fetchMock.mockResolvedValueOnce(response({ journeyVersion: 2 }));
  await refreshJourneyCapability();
  fetchMock.mockResolvedValue(response({ accepted: 1 }));
  trackEvent("review_viewed", { surface: "bar" }, "job_1");
  await flushEvents();
  const event = JSON.parse(fetchMock.mock.calls[1][1].body).events[0];
  expect(event.properties).toMatchObject({
    telemetryVersion: 2,
    surface: "bar",
    appVersion: "0.2.4-test",
    sessionId: expect.any(String),
  });
  setAnalyticsConsent(null);
  trackEvent("export_requested", {}, "job_1");
  await flushEvents();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  vi.unstubAllEnvs();
});

it("network capability failure keeps the offline queue and retries after backoff", async () => {
  vi.useFakeTimers();
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await refreshJourneyCapability();
  trackEvent("review_viewed", {}, "job_1");
  await flushEvents();
  expect(JSON.parse(safeStorage.getItem(key)!)[0].name).toBe("review_viewed");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock
    .mockResolvedValueOnce(response({ journeyVersion: 2 }))
    .mockResolvedValue(response({ accepted: 1 }));
  await vi.advanceTimersByTimeAsync(30_000);
  await flushEvents();
  await refreshJourneyCapability();
  await flushEvents();
  expect(JSON.parse(safeStorage.getItem(key)!)).toEqual([]);
  vi.useRealTimers();
});

it("capture cancel in a second webview uses the persisted start attempt and original surface", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  const id = startInputAttempt("capture", "bar");
  // A separate module has no shared JS state, but shares the app-origin storage.
  vi.resetModules();
  const otherWindow = await import("./analyticsClient");
  otherWindow.setAnalyticsConsent("consent");
  otherWindow.finishInputAttempt("capture", "cancelled");
  const allEvents = JSON.parse(safeStorage.getItem(key)!);
  expect(allEvents.some((e: { name: string }) => e.name === "input_started")).toBe(true);
  const cancelled = allEvents.find((e: { name: string }) => e.name === "input_cancelled");
  expect(cancelled.properties).toMatchObject({ attemptId: id, surface: "bar" });
  expect(safeStorage.getItem("standin.analytics.input-attempt.v1.capture")).toBeNull();
});
it("withdrawal clears pending input and cannot resurrect its cancellation", () => {
  startInputAttempt("file");
  setAnalyticsConsent(null);
  setAnalyticsConsent("new-consent");
  finishInputAttempt("file", "cancelled");
  expect(safeStorage.getItem("standin.analytics.input-attempt.v1.file")).toBeNull();
  expect(JSON.parse(safeStorage.getItem(key) ?? "[]")).toEqual([]);
});

it("suspended consent does not erase pending events during periodic flush and same-consent restore", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  startInputAttempt("capture", "bar");
  const pending = safeStorage.getItem(key);
  const requestCount = fetchMock.mock.calls.length;
  suspendAnalyticsConsent();
  await flushEvents();
  expect(safeStorage.getItem(key)).toBe(pending);
  expect(fetchMock).toHaveBeenCalledTimes(requestCount);
  setAnalyticsConsent("consent");
  finishInputAttempt("capture", "cancelled");
  const names = JSON.parse(safeStorage.getItem(key)!).map((event: { name: string }) => event.name);
  expect(names).toEqual(["input_started", "input_cancelled"]);
});
