import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { PersonalDeformCards, PersonalDeformLibrary } from "./PersonalDeformCards";
import { localSelectionKey, useLocalBodies, useLocalImport } from "./store";
import type { LocalModel } from "./contract";
import { useInstallationStore } from "@/features/installation/installationStore";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  import: vi.fn(),
}));
vi.mock("./api", () => ({
  localBodyApi: {
    ...api,
    supported: () => true,
    capabilities: async () => ({ available: true, formats: ["fbx", "cs3c"] }),
    preview: async () => new Uint8Array([1]),
    progress: async () => () => {},
  },
}));
vi.mock("./LocalFbxPreview", () => ({
  LocalFbxPreview: ({ name }: { name: string }) => <span>{name} 미리보기</span>,
}));
const model: LocalModel = {
  localModelId: "00000000-0000-4000-8000-000000000001",
  name: "내 데포르메 A",
  sourceHash: "a".repeat(64),
  format: "cs3c",
  version: 1,
  importerVersion: "2",
  normalizationVersion: "2",
  rigMappingVersion: "2",
  converterVersion: "2",
  createdAt: 1,
  updatedAt: 1,
  capabilities: { bodyPose: true, leftHand: false, rightHand: false },
};
let models: LocalModel[];
function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (child: React.ReactNode) => (
    <QueryClientProvider client={client}>{child}</QueryClientProvider>
  );
  const view = render(tree(node));
  return { ...view, remount: (child: React.ReactNode) => view.rerender(tree(child)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  models = [{ ...model }];
  api.list.mockImplementation(async () => models);
  api.rename.mockImplementation(async (id, name) => {
    models = models.map((m) => (m.localModelId === id ? { ...m, name } : m));
  });
  api.remove.mockImplementation(async () => {
    models = [];
  });
  useLocalBodies.setState({ models: [], selected: {}, scroll: {} });
  useLocalImport.setState({ jobId: undefined, stage: "", error: "" });
  useInstallationStore.setState({
    credentials: { installationId: "personal-ui", deviceToken: "t", consentVersion: "v" },
  });
});
it("opens import from the first plus card; the dialog contains no existing-card management", async () => {
  show(<PersonalDeformLibrary />);
  await screen.findByRole("button", { name: `${model.name} 이름 변경` });
  const grid = screen.getByLabelText("내 데포르메 카드");
  expect(within(grid).getAllByRole("button")[0]).toHaveAccessibleName("내 데포르메 불러오기");
  fireEvent.click(screen.getByRole("button", { name: "내 데포르메 불러오기" }));
  const dialog = screen.getByRole("dialog", { name: "내 데포르메 불러오기" });
  expect(within(dialog).getByRole("textbox", { name: "카드 이름" })).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "FBX·CS3C 파일 선택" })).toBeVisible();
  expect(within(dialog).queryByText(model.name)).toBeNull();
  expect(
    within(dialog).queryByRole("button", { name: /모습 확인|이름 변경|파일 교체|삭제/ }),
  ).toBeNull();
  expect(dialog.closest("[data-replay-private]")).toBeTruthy();
});
it("renames inline, preserves input after failure, and allows Escape cancellation", async () => {
  show(<PersonalDeformLibrary />);
  fireEvent.click(await screen.findByRole("button", { name: `${model.name} 이름 변경` }));
  const input = screen.getByRole("textbox", { name: "카드 이름" });
  fireEvent.change(input, { target: { value: "   " } });
  fireEvent.submit(input.closest("form")!);
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(api.rename).not.toHaveBeenCalled();
  api.rename.mockRejectedValueOnce({ code: "STORAGE_FAILED" });
  fireEvent.change(input, { target: { value: "  주인공  " } });
  fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("  주인공  ");
  fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
  await screen.findByRole("button", { name: "주인공 이름 변경" });
  expect(api.rename).toHaveBeenLastCalledWith(model.localModelId, "주인공");
  expect(useLocalBodies.getState().models[0].name).toBe("주인공");
  fireEvent.click(screen.getByRole("button", { name: "주인공 이름 변경" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "카드 이름" }), { key: "Escape" });
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("cancels deletion without a call, handles a failure, then prunes selected references on success", async () => {
  show(<PersonalDeformLibrary />);
  fireEvent.click(await screen.findByRole("button", { name: `${model.name} 삭제` }));
  expect(screen.getByText(/따로 저장한 FBX는 그대로/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(api.remove).not.toHaveBeenCalled();
  act(() => useLocalBodies.getState().select(localSelectionKey("job", 0), model.localModelId));
  fireEvent.click(screen.getByRole("button", { name: `${model.name} 삭제` }));
  api.remove.mockRejectedValueOnce({ code: "STORAGE_FAILED" });
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(useLocalBodies.getState().selected[localSelectionKey("job", 0)]).toBe(model.localModelId);
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(useLocalBodies.getState().selected).toEqual({});
  expect(screen.queryByRole("button", { name: `${model.name} 삭제` })).toBeNull();
});
for (const variant of ["app", "bar"] as const) {
  it(`${variant}: selects cards only and restores per-person scrolling after remount`, async () => {
    const node = (person: number) => (
      <PersonalDeformCards job="selection" person={person} variant={variant} />
    );
    const view = show(node(0));
    const card = await screen.findByRole("radio", { name: model.name });
    expect(card).toHaveClass(variant === "app" ? "w-[140px]" : "w-[96px]");
    expect(screen.queryByRole("button", { name: /불러오기|이름 변경|삭제/ })).toBeNull();
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-checked", "true");
    const strip = screen.getByRole("radiogroup");
    strip.scrollLeft = 312;
    fireEvent.scroll(strip);
    view.remount(node(1));
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radiogroup").scrollLeft).toBe(0);
    view.remount(node(0));
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radiogroup").scrollLeft).toBe(312);
  });
}
it("reports a failed library load and can retry without showing a fabricated empty success", async () => {
  api.list.mockRejectedValueOnce(new Error("unavailable"));
  show(<PersonalDeformCards job="error" person={0} variant="app" />);
  await screen.findByRole("alert");
  expect(screen.queryByText(/여기에 표시돼요/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await screen.findByRole("radio", { name: model.name });
});
