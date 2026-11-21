import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { ApiError } from "@/shared/api/client";
import { bodyKeys } from "./api";
import { useBodyPickerVisibility } from "./preferences";
import type { BodyPreferences } from "./contract";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  listeners: new Set<(event: { payload: { owner: string; revision: number } }) => void>(),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getPreferences: mocks.get,
  putPreferences: mocks.put,
}));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof import("@tauri-apps/api/core")>()),
  isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    _name: string,
    callback: (event: { payload: { owner: string; revision: number } }) => void,
  ) => {
    mocks.listeners.add(callback);
    return () => mocks.listeners.delete(callback);
  },
  emit: async (_name: string, payload: { owner: string; revision: number }) => {
    for (const callback of mocks.listeners) callback({ payload });
  },
}));
let server: BodyPreferences;
function surface() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, ...renderHook(useBodyPickerVisibility, { wrapper }) };
}
beforeEach(() => {
  mocks.listeners.clear();
  mocks.get.mockReset();
  mocks.put.mockReset();
  useInstallationStore.setState({
    credentials: { installationId: "picker-owner", deviceToken: "test", consentVersion: "test" },
  });
  server = {
    version: "body-preferences.v1",
    scope: "installation",
    mode: "last_used",
    cards: [],
    lastUsed: null,
    revision: 2,
    pickerVisibility: { hiddenPresetIds: [], hiddenCardIds: [] },
  };
  mocks.get.mockImplementation(async () => structuredClone(server));
  mocks.put.mockImplementation(async (change, revision) => {
    expect(revision).toBe(server.revision);
    server = { ...server, ...change, revision: revision + 1 };
    return structuredClone(server);
  });
});

it("a successful setting write refreshes another app/bar cache, but never another installation's event", async () => {
  const app = surface(),
    bar = surface();
  await waitFor(() =>
    expect(app.result.current.supported && bar.result.current.supported).toBe(true),
  );
  await waitFor(() => expect(mocks.listeners.size).toBe(2));
  await act(async () => {
    await app.result.current.mutation.mutateAsync({
      kind: "preset",
      id: "male-base",
      included: false,
    });
  });
  await waitFor(() =>
    expect(
      bar.qc.getQueryData<BodyPreferences>(bodyKeys.preferences("picker-owner"))?.pickerVisibility
        ?.hiddenPresetIds,
    ).toEqual(["male-base"]),
  );
  const calls = mocks.get.mock.calls.length;
  await act(async () => {
    for (const callback of mocks.listeners)
      callback({ payload: { owner: "another-owner", revision: 999 } });
  });
  expect(mocks.get).toHaveBeenCalledTimes(calls);
  app.unmount();
  bar.unmount();
});

it("revision conflicts refetch saved settings instead of keeping an optimistic hide", async () => {
  const app = surface();
  await waitFor(() => expect(app.result.current.supported).toBe(true));
  mocks.put.mockRejectedValue(new ApiError(409, "BODY_PREFERENCE_CONFLICT", "conflict"));
  await act(async () => {
    await app.result.current.mutation
      .mutateAsync({ kind: "card", id: "card-a", included: false })
      .catch(() => undefined);
  });
  await waitFor(() => expect(app.result.current.mutation.isError).toBe(true));
  expect(
    app.qc.getQueryData<BodyPreferences>(bodyKeys.preferences("picker-owner"))?.pickerVisibility
      ?.hiddenCardIds,
  ).toEqual([]);
  expect(server.mode).toBe("last_used");
  app.unmount();
});
