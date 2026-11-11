import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { safeStorage } from "@/shared/lib/safeStorage";
import {
  setAnalyticsConsent,
  suspendAnalyticsConsent,
  resetJourneyCapability,
} from "./analyticsClient";
import { useAppStarted } from "./useAppStarted";
it("records app start once after consent restores, not during unknown or withdrawn consent", async () => {
  setAnalyticsConsent(null);
  resetJourneyCapability();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const environment = vi
    .fn()
    .mockResolvedValue({
      platform: "macos",
      appVersion: "test",
      osVersion: "test",
      deviceModel: "test",
    });
  const { rerender } = renderHook(() => useAppStarted("deferred-installation", environment));
  expect(environment).not.toHaveBeenCalled();
  act(() => setAnalyticsConsent("restored-app"));
  const events = () => JSON.parse(safeStorage.getItem("standin.analytics.queue.v1") ?? "[]");
  await waitFor(() =>
    expect(events().filter((e: { name: string }) => e.name === "app_started")).toHaveLength(1),
  );
  act(() => suspendAnalyticsConsent());
  act(() => setAnalyticsConsent("restored-app"));
  rerender();
  expect(environment).toHaveBeenCalledTimes(1);
  expect(events().filter((e: { name: string }) => e.name === "app_started")).toHaveLength(1);
  act(() => setAnalyticsConsent(null));
  vi.unstubAllGlobals();
});
