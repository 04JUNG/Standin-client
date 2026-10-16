import { createElement } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { myDefaultOf, useMyDefault } from "./preferences";
import { sameShape } from "./shapeValues";
import type { BodyPreferences, ShapeSpec } from "./contract";

const api = vi.hoisted(() => ({ getPreferences: vi.fn(), putPreferences: vi.fn() }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...api,
}));

const prefs = (over: Partial<BodyPreferences> = {}): BodyPreferences => ({
  version: "body-preferences.v1",
  scope: "installation",
  mode: "fixed_default",
  defaultCharacterId: "male-base",
  shapeDefault: null,
  revision: 4,
  ...over,
});
function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}
beforeEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "2026-08-02" },
  });
});

describe("내 기본값 규칙", () => {
  it("reads the body and its numbers as one default; numbers win over a stale character", () => {
    expect(myDefaultOf(null)).toBeNull();
    expect(myDefaultOf(prefs({ defaultCharacterId: null }))).toBeNull();
    expect(myDefaultOf(prefs())).toEqual({ characterId: "male-base", controls: null });
    expect(
      myDefaultOf(
        prefs({
          defaultCharacterId: "male-base",
          shapeDefault: { characterId: "male-bulk", controls: { muscle_bulk: 1 } },
        }),
      ),
    ).toEqual({ characterId: "male-bulk", controls: { muscle_bulk: 1 } });
  });

  it("compares numbers with missing keys as the body's start values", () => {
    const spec: ShapeSpec = {
      schemaVersion: "body-shape.v1",
      controls: [
        { key: "height", min: 160, max: 195, step: 1, default: 178 },
        { key: "muscle", min: 0, max: 2, step: 0.05, default: 0 },
      ],
    };
    expect(sameShape(spec, { height: 178 }, null)).toBe(true);
    expect(sameShape(spec, { height: 182 }, { height: 182, muscle: 0 })).toBe(true);
    expect(sameShape(spec, { height: 182 }, { height: 181 })).toBe(false);
  });
});

describe("useMyDefault", () => {
  it("saves the body and its numbers together and keeps the start mode", async () => {
    api.getPreferences.mockResolvedValue(prefs());
    api.putPreferences.mockImplementation(async (v) => prefs({ ...v, revision: 5 }));
    const { result } = renderHook(() => useMyDefault(), { wrapper: setup() });
    await waitFor(() => expect(result.current.value).not.toBeNull());
    await act(() =>
      result.current.save.mutateAsync({ characterId: "male-bulk", controls: { muscle_bulk: 1 } }),
    );
    expect(api.putPreferences).toHaveBeenCalledWith(
      {
        mode: "fixed_default",
        defaultCharacterId: "male-bulk",
        shapeDefault: { characterId: "male-bulk", controls: { muscle_bulk: 1 } },
      },
      4,
    );
    await waitFor(() =>
      expect(result.current.value).toEqual({
        characterId: "male-bulk",
        controls: { muscle_bulk: 1 },
      }),
    );
  });

  it("saves a fixed body without numbers and clears old numbers", async () => {
    api.getPreferences.mockResolvedValue(
      prefs({ shapeDefault: { characterId: "male-base", controls: { height: 182 } } }),
    );
    api.putPreferences.mockImplementation(async (v) => prefs({ ...v, revision: 5 }));
    const { result } = renderHook(() => useMyDefault(), { wrapper: setup() });
    await waitFor(() => expect(result.current.value).not.toBeNull());
    await act(() => result.current.save.mutateAsync({ characterId: "child", controls: null }));
    expect(api.putPreferences).toHaveBeenCalledWith(
      { mode: "fixed_default", defaultCharacterId: "child", shapeDefault: null },
      4,
    );
  });

  it("clearing also turns 'start with my default' back to auto", async () => {
    api.getPreferences.mockResolvedValue(prefs());
    api.putPreferences.mockImplementation(async (v) => prefs({ ...v, revision: 5 }));
    const { result } = renderHook(() => useMyDefault(), { wrapper: setup() });
    await waitFor(() => expect(result.current.value).not.toBeNull());
    await act(() => result.current.save.mutateAsync(null));
    expect(api.putPreferences).toHaveBeenCalledWith(
      { mode: "auto", defaultCharacterId: null, shapeDefault: null },
      4,
    );
    await waitFor(() => expect(result.current.value).toBeNull());
  });
});
