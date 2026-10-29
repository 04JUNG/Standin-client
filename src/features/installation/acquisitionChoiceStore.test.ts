import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAcquisitionChoiceStore as store } from "./acquisitionChoiceStore";

beforeEach(() => {
  store.getState().reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("scopes persisted permission to one installation and expires it after 90 days", () => {
  store.getState().record("install-a", true);
  expect(store.getState().mode("install-a")).toBe("allow");
  expect(store.getState().mode("install-b")).toBe("unset");
  expect(store.getState().mode(undefined)).toBe("unset");
  vi.advanceTimersByTime(90 * 24 * 60 * 60 * 1000);
  expect(store.getState().mode("install-a")).toBe("unset");
});

it("keeps a refusal when storage is unavailable and clears it on installation deletion", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  store.getState().record("install-a", false);
  expect(store.getState().mode("install-a")).toBe("deny");
  store.getState().reset();
  expect(store.getState().mode("install-a")).toBe("unset");
});

it("does not accept a choice dated in the future", () => {
  store.getState().record("install-a", true);
  vi.setSystemTime(Date.now() - 1000);
  expect(store.getState().mode("install-a")).toBe("unset");
});
