import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const track = vi.hoisted(() => vi.fn());
vi.mock("./analyticsClient", () => ({ trackEvent: track, currentSurface: () => "bar" }));
import { useReviewJourney } from "./useReviewJourney";
beforeEach(() => track.mockClear());
it("ready file is observed independently of preview, and changes start a fresh correlated preparation", () => {
  const hook = renderHook((state) => useReviewJourney(state), {
    initialProps: { jobId: "job_1", binding: "v1", ready: false, failed: false, format: "fbx" },
  });
  const firstId = track.mock.calls.find(([name]) => name === "preparation_started")![1].attemptId;
  hook.rerender({ jobId: "job_1", binding: "v1", ready: true, failed: false, format: "fbx" });
  hook.rerender({ jobId: "job_1", binding: "v1", ready: true, failed: false, format: "fbx" });
  expect(track.mock.calls.filter(([name]) => name === "review_viewed")).toHaveLength(1);
  expect(track.mock.calls.filter(([name]) => name === "preparation_ready")).toHaveLength(1);
  expect(track).toHaveBeenCalledWith(
    "preparation_ready",
    expect.objectContaining({ attemptId: firstId }),
    "job_1",
  );
  hook.rerender({ jobId: "job_1", binding: "v2", ready: false, failed: true, format: "fbx" });
  const failure = track.mock.calls.find(([name]) => name === "preparation_failed")!;
  expect(failure[1].attemptId).not.toBe(firstId);
  expect(failure[1].code).toBe("PREPARATION_UNAVAILABLE");
});
