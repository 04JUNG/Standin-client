import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { LocalLibrary } from "./LocalLibrary";
import { useLocalBodies, useLocalImport } from "./store";
const fixtures = vi.hoisted(() => ({
  import: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("./api", () => ({
  localBodyApi: {
    supported: () => true,
    capabilities: async () => ({ available: true, formats: ["fbx"] }),
    list: async () => [],
    import: fixtures.import,
    cancel: fixtures.cancel,
    progress: fixtures.progress,
    remove: fixtures.remove,
  },
}));
beforeEach(() => {
  fixtures.import.mockReset();
  fixtures.cancel.mockReset().mockResolvedValue(undefined);
  fixtures.progress.mockResolvedValue(() => {});
  useLocalBodies.setState({ models: [], selected: {}, scroll: {} });
  useLocalImport.setState({ jobId: undefined, stage: "", error: "" });
});
it("keeps an in-flight registration cancellable after moving between app and bar", async () => {
  let finish: (value: null) => void = () => {};
  fixtures.import.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={client}>
      <LocalLibrary job="job" person={0} openInitially />
    </QueryClientProvider>
  );
  const first = render(view());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "FBX·CS3C 파일 선택" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "FBX·CS3C 파일 선택" }));
  await waitFor(() => expect(fixtures.import).toHaveBeenCalledTimes(1));
  const id = useLocalImport.getState().jobId;
  first.unmount();
  render(view());
  expect(screen.getByRole("button", { name: /^취소$/ })).toBeEnabled();
  act(() => useLocalImport.setState({ stage: "체형을 확인하고 있어요." }));
  expect(screen.getByText("체형을 확인하고 있어요.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^취소$/ }));
  expect(fixtures.cancel).toHaveBeenCalledWith(id);
  await act(async () => finish(null));
  await waitFor(() => expect(useLocalImport.getState().jobId).toBeUndefined());
  expect(screen.getByText("파일 선택을 취소했어요.")).toBeVisible();
  client.clear();
});
