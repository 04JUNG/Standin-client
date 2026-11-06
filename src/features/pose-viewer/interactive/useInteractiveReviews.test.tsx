import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ controller: vi.fn() }));
vi.mock("./session", () => ({
  interactiveController: fixture.controller,
  interactiveVersion: () => 0,
  subscribeInteractive: () => () => {},
}));
import { useInteractiveReviews } from "./useInteractiveReviews";
beforeEach(() => fixture.controller.mockReset());
it("does not create server controllers or expose native bindings for personal people in a mixed review", () => {
  const controller = {
    select: vi.fn(),
    snapshot: () => ({ binding: "server" }),
    ready: () => true,
    retry: vi.fn(),
  };
  fixture.controller.mockReturnValue(controller);
  const { result } = renderHook(() =>
    useInteractiveReviews({
      enabled: true,
      owner: "owner",
      jobId: "job",
      requests: [
        {
          personIndex: 0,
          binding: "private-model-snapshot",
          candidateId: "local-pose",
          ready: false,
          active: false,
        },
        {
          personIndex: 1,
          binding: "server",
          candidateId: "public-pose",
          ready: true,
          appearance: { version: "fbx-outline-v1", width: 2 },
          skin: { version: "fbx-skin-v1", id: "flesh" },
        },
      ],
    }),
  );
  expect(fixture.controller).toHaveBeenCalledTimes(1);
  expect(fixture.controller).toHaveBeenCalledWith("owner", "job", 1);
  expect(controller.select).toHaveBeenCalledWith(
    "server",
    "public-pose",
    true,
    { version: "fbx-outline-v1", width: 2 },
    { version: "fbx-skin-v1", id: "flesh" },
  );
  expect(result.current.controllers[0]).toBeUndefined();
  expect(result.current.snapshots[0]).toBeUndefined();
  expect(result.current.ready).toBe(true);
  result.current.retry();
  expect(controller.retry).toHaveBeenCalledTimes(1);
});
