import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { safeStorage } from "@/shared/lib/safeStorage";
import { setAnalyticsConsent, resetJourneyCapability } from "./analyticsClient";
import { usePreviewJourney } from "./usePreviewJourney";
it("records actual ready once, correlates render timing, and never sends image URLs", () => {
  setAnalyticsConsent(null);
  setAnalyticsConsent("preview-consent");
  resetJourneyCapability();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { result, rerender } = renderHook(
    ({ src }) => usePreviewJourney("job_preview", src, "pose_selection", "candidate_image"),
    { initialProps: { src: "https://private.invalid/image.png" } },
  );
  const events = () => JSON.parse(safeStorage.getItem("standin.analytics.queue.v1") ?? "[]");
  expect(events().map((e: { properties: { action: string } }) => e.properties.action)).toEqual([
    "preview_started",
  ]);
  act(() => result.current("ready"));
  act(() => result.current("ready"));
  rerender({ src: "https://private.invalid/image.png" });
  const recorded = events();
  expect(recorded).toHaveLength(2);
  expect(recorded[1].properties).toMatchObject({
    action: "preview_completed",
    attemptId: recorded[0].properties.attemptId,
    elapsedMs: expect.any(Number),
  });
  expect(JSON.stringify(recorded)).not.toContain("private.invalid");
  act(() => setAnalyticsConsent(null));
  vi.unstubAllGlobals();
});
