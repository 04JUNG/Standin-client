import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { LocalLibrary } from "./LocalLibrary";
import { useLocalBodies, useLocalImport } from "./store";
const fixtures = vi.hoisted(() => ({
  list: vi.fn(),
  import: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("./api", () => ({
  localBodyApi: {
    supported: () => true,
    capabilities: async () => ({ available: true, formats: ["fbx"] }),
    list: fixtures.list,
    import: fixtures.import,
    cancel: fixtures.cancel,
    progress: fixtures.progress,
    remove: fixtures.remove,
  },
}));
beforeEach(() => {
  fixtures.list.mockReset().mockResolvedValue([]);
  fixtures.import.mockReset();
  fixtures.cancel.mockReset().mockResolvedValue(undefined);
  fixtures.progress.mockResolvedValue(() => {});
  useLocalBodies.setState({ models: [], selected: {}, scroll: {} });
  useLocalImport.setState({ jobId: undefined, stage: "", error: "" });
});
it("keeps an in-flight registration cancellable after leaving and returning to the custom library", async () => {
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
      <LocalLibrary openInitially />
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

const model = {
  localModelId: "00000000-0000-4000-8000-000000000001",
  name: "새 데포르메",
  sourceHash: "a".repeat(64),
  format: "cs3c" as const,
  version: 1,
  importerVersion: "2",
  normalizationVersion: "2",
  rigMappingVersion: "2",
  converterVersion: "2",
  createdAt: 1,
  updatedAt: 1,
  capabilities: { bodyPose: true as const, leftHand: false, rightHand: false },
};
for (const duplicate of [false, true]) {
  it(`imports through native API and ${duplicate ? "reuses the existing card" : "publishes the new card"}`, async () => {
    fixtures.list.mockResolvedValue(duplicate ? [model] : []);
    fixtures.import.mockImplementation(async () => {
      fixtures.list.mockResolvedValue([model]);
      return model;
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocalLibrary openInitially />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "FBX·CS3C 파일 선택" })).toBeEnabled(),
    );
    await waitFor(() => expect(useLocalBodies.getState().models).toHaveLength(duplicate ? 1 : 0));
    fireEvent.change(screen.getByRole("textbox", { name: "카드 이름" }), {
      target: { value: "  새 데포르메  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "FBX·CS3C 파일 선택" }));
    await waitFor(() =>
      expect(fixtures.import).toHaveBeenCalledWith(expect.any(String), "새 데포르메"),
    );
    await screen.findByText(duplicate ? /이미 등록한 파일/ : /데포르메를 불러왔어요/);
    expect(useLocalBodies.getState().models).toEqual([model]);
  });
}
it("keeps a successfully imported card if reloading the library fails", async () => {
  fixtures.import.mockImplementation(async () => {
    fixtures.list.mockRejectedValue(new Error("read failed"));
    return model;
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocalLibrary openInitially />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "FBX·CS3C 파일 선택" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "FBX·CS3C 파일 선택" }));
  await screen.findByRole("alert");
  expect(useLocalBodies.getState().models).toEqual([model]);
  expect(useLocalImport.getState().jobId).toBeUndefined();
});
