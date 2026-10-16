import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { catalog, selection } from "./fixtures";
const mocks = vi.hoisted(() => ({ getCatalog: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("./api", () => ({
  getHandCatalog: mocks.getCatalog,
  getHandSelection: mocks.get,
  putHandSelection: mocks.put,
  handKeys: {
    catalog: (o: string) => ["hands", o, "catalog"],
    selection: (o: string, j: string, p: number) => ["hands", o, j, p],
  },
}));
import { useHands } from "./hooks";
const result = { jobId: "job", capabilities: { handSelection: true } } as AnalysisResult;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCatalog.mockResolvedValue(catalog);
  mocks.get.mockResolvedValue(selection);
});
function setup(data = result) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(() => useHands(data, [0], true), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, qc };
}
it("waits for server selection before allowing final review and commits only successful writes", async () => {
  let finish!: (value: unknown) => void;
  mocks.put.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = setup();
  expect(hook.result.current.ready).toBe(false);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.change(selection, { left: "fist" }));
  await waitFor(() => expect(hook.result.current.pending).toBe(true));
  expect(hook.result.current.ready).toBe(false);
  expect(hook.result.current.entries[0]!.selection!.left).toBe("relaxed");
  await act(async () => {
    finish({ ...selection, left: "fist", revision: 1, changed: ["left"] });
  });
  await waitFor(() => expect(hook.result.current.entries[0]!.selection!.revision).toBe(1));
});
it("failed writes retain the server selection; conflicts reload catalog and selection", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  mocks.put.mockRejectedValue(new ApiError(409, "HAND_LIBRARY_CHANGED", "changed"));
  act(() => hook.result.current.change(selection, { left: "fist" }));
  await waitFor(() => expect(hook.result.current.changeError).toBeTruthy());
  expect(hook.result.current.entries[0]!.selection!.left).toBe("relaxed");
  await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalledTimes(2));
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it("old servers do not cause any hand network calls", () => {
  const hook = setup({ ...result, capabilities: {} } as AnalysisResult);
  expect(hook.result.current.enabled).toBe(false);
  expect(mocks.getCatalog).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});

it("blocks final review when a saved selection and cached catalog use different libraries", async () => {
  mocks.get.mockResolvedValue({ ...selection, library_sha256: "b".repeat(64) });
  const hook = setup();
  await waitFor(() => expect(hook.result.current.error).toBe(true));
  expect(hook.result.current.ready).toBe(false);
});
