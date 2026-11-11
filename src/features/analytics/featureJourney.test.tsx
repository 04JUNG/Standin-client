import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { safeStorage } from "@/shared/lib/safeStorage";
import { ApiError } from "@/shared/api/errors";
import {
  setAnalyticsConsent,
  resetJourneyCapability,
  refreshJourneyCapability,
  resetAnalyticsQueue,
  flushEvents,
  trackEvent,
} from "./analyticsClient";
import {
  featureAction,
  featureAttribution,
  failureProperties,
  useFeatureView,
} from "./featureJourney";
import { setInstallationCredentials } from "@/shared/api/client";
vi.mock("./api/analytics.service", async () => ({
  analyticsService: (await import("./api/analytics.http")).analyticsHttp,
}));
const key = "standin.analytics.queue.v1";
const events = () => JSON.parse(safeStorage.getItem(key) ?? "[]");
beforeEach(() => {
  resetAnalyticsQueue();
  resetJourneyCapability();
  setAnalyticsConsent("feature-consent");
  setInstallationCredentials({ installationId: "test", deviceToken: "token" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});
it("v2-only BFF receives legacy journey names but no feature names", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ journeyVersion: 2 })))
    .mockResolvedValue(new Response(JSON.stringify({ accepted: 1 })));
  await refreshJourneyCapability();
  featureAction("history", "open");
  trackEvent("review_viewed", {}, "job_1");
  await flushEvents();
  const batches = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(batches).toHaveLength(1);
  expect(
    JSON.parse(batches[0][1]!.body as string).events.map((e: { name: string }) => e.name),
  ).toEqual(["review_viewed"]);
});
it("unknown capability retains new events; explicit v2-only drops only unsupported names", async () => {
  featureAction("history", "open");
  await refreshJourneyCapability();
  expect(events().map((e: { name: string }) => e.name)).toEqual(["feature_action"]);
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ journeyVersion: 2 })))
    .mockResolvedValue(new Response(JSON.stringify({ accepted: 1 })));
  await refreshJourneyCapability();
  await flushEvents();
  expect(events()).toEqual([]);
});
it("actual exposure waits for available controls and is deduplicated across rerenders", () => {
  const { rerender } = renderHook(
    ({ ready }) => useFeatureView("hand_library", ready, "exposure", "job_1"),
    { initialProps: { ready: false } },
  );
  expect(events()).toHaveLength(0);
  rerender({ ready: true });
  rerender({ ready: true });
  expect(events()).toHaveLength(1);
  expect(events()[0].properties.action).toBe("exposure");
});
it("manual selection is not successful application and attribution is consent-scoped", () => {
  featureAction("hand_library", "selected", "job_attribution");
  expect(featureAttribution("job_attribution").usedHandLibrary).toBe(false);
  featureAction("hand_library", "applied", "job_attribution");
  expect(featureAttribution("job_attribution").usedHandLibrary).toBe(true);
  setAnalyticsConsent(null);
  setAnalyticsConsent("other");
  expect(featureAttribution("job_attribution").usedHandLibrary).toBe(false);
});
it.each([
  [new ApiError(503, "UPSTREAM_FAILED", "private path"), "server"],
  [new ApiError(403, "DENIED", "secret"), "permission"],
  [new ApiError(422, "INVALID", "secret"), "validation"],
  [{ kind: "network", message: "private query" }, "network"],
  [{ code: "EACCES", message: "private path" }, "permission"],
])("classifies structured failures without raw content", (error, expected) => {
  const result = failureProperties(error, "export");
  expect(result.errorCategory).toBe(expected);
  expect(JSON.stringify(result)).not.toMatch(/private|secret/);
});

it("emits available feature exposure only after consent restoration", () => {
  setAnalyticsConsent(null);
  renderHook(() => useFeatureView("history", true));
  expect(events()).toHaveLength(0);
  act(() => setAnalyticsConsent("restored"));
  expect(events()).toHaveLength(1);
  expect(events()[0].properties.action).toBe("exposure");
});
