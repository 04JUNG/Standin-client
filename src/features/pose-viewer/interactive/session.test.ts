import { afterEach, expect, it, vi } from "vitest";
import { InteractiveController } from "./controller";
import { forgetInteractiveJob, interactiveController } from "./session";
import { usePoseSelectionStore as store } from "../store/poseSelectionStore";

afterEach(() => {
  forgetInteractiveJob("job-session-appearance");
  vi.restoreAllMocks();
});

it("routes real skin/width/gesture store changes to appearance invalidation, preserving the geometry binding", () => {
  store.getState().startJob("job-session-appearance", "body-a");
  store.getState().selectCandidate(0, "candidate");
  const client = interactiveController("owner", "job-session-appearance", 0);
  client.select("base-file", "candidate", false, undefined, undefined, "base-a");
  const invalidate = vi.spyOn(client, "invalidate");
  const appearance = vi.spyOn(client, "invalidateAppearance");
  for (const change of [
    () => store.getState().setPersonSkin(0, "flesh"),
    () => store.getState().setOutlineEditing(0, true),
    () => store.getState().setPersonOutline(0, 0.5),
    () => store.getState().setOutlineEditing(0, false),
  ]) {
    // A hook commits each new binding after the synchronous store notification.
    client.select("base-file", "candidate", false, undefined, undefined, "base-a");
    change();
    expect(client.ready("base-file")).toBe(false);
  }
  expect(appearance).toHaveBeenCalledTimes(4);
  expect(invalidate).not.toHaveBeenCalled();
  client.select("base-file", "candidate", false, undefined, undefined, "base-a");
  store.getState().setPersonCharacter(0, "body-b");
  expect(invalidate).toHaveBeenCalledOnce();
});

it("still fully invalidates on a candidate change while the old operation is not yet available", () => {
  store.getState().startJob("job-session-appearance", "body-a");
  store.getState().selectCandidate(0, "candidate");
  const client = interactiveController("owner", "job-session-appearance", 0);
  client.select("pending", "candidate", false);
  const invalidate = vi.spyOn(InteractiveController.prototype, "invalidate");
  store.getState().selectCandidate(0, "other");
  expect(invalidate).toHaveBeenCalledOnce();
});
