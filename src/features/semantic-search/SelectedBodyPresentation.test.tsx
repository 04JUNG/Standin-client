import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { BodySelection } from "@/features/body-selection/contract";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import type { PosePresentation } from "@/features/pose-viewer/api/posePresentation";
import { SemanticModelPresentation } from "./SemanticModelPresentation";
import { loadSemanticModel } from "./modelPreview";
import { putSelection } from "@/features/body-selection/api";
const state = vi.hoisted(() => ({
  selection: null as BodySelection | null,
  error: null as Error | null,
}));
vi.mock("./modelPreview", () => ({ loadSemanticModel: vi.fn() }));
vi.mock("@/features/body-selection/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/body-selection/api")>()),
  getSelection: vi.fn(async () => {
    if (state.error) throw state.error;
    return state.selection;
  }),
  putSelection: vi.fn(async (_j, _p, change) => {
    state.selection = {
      ...state.selection!,
      intent: "manual",
      manualCharacterId: change.characterId,
      resolutionStatus: "ready",
      selectionRevision: state.selection!.selectionRevision + 1,
      resolvedBody: { ...state.selection!.resolvedBody!, characterId: change.characterId },
    };
    return state.selection;
  }),
  getOptions: vi.fn(async () => ({
    catalogRevision: "v1",
    characters: [
      { characterId: "male-test", displayName: "테스트 남성", selectable: true, reasonCodes: [] },
      { characterId: "female-test", displayName: "테스트 여성", selectable: true, reasonCodes: [] },
    ],
  })),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { characters: [] } }),
}));
vi.mock("@/features/body-selection/preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/body-selection/preferences")>()),
  useBodyPreferences: () => ({ data: null }),
}));
vi.mock("@/features/body-selection/LiveBodyView", () => ({
  LiveBodyView: () => null,
  NeutralImage: () => null,
  ShapeThumb: () => null,
}));
vi.mock("@/features/pose-viewer/components/ReviewModelPreview", () => ({
  ReviewModelPreview: ({ model, label }: { model: { characterId: string }; label: string }) => (
    <canvas role="img" aria-label={label} data-character={model.characterId} />
  ),
}));
const person = { index: 0, fallbackMode: "none", candidates: [] } as unknown as PersonResult;
const presentation = {
  version: "semantic-pose-presentation-v1",
  person_index: 0,
  status: "ready",
  search_status: "ok",
  issues: [],
  output_scope: "full",
  library_candidates: [
    {
      candidate_id: "candidate",
      rank: 1,
      kind: "library_match",
      asset: { preview_bvh_url: "/test" },
    },
  ],
  review_candidates: [],
  generated_candidates: [],
} as unknown as PosePresentation;
beforeEach(() => {
  state.error = null;
  vi.mocked(putSelection).mockClear();
  vi.mocked(loadSemanticModel).mockClear();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "2026-08-02" },
  });
  state.selection = {
    schemaVersion: "body-selection.v1",
    personIndex: 0,
    intent: "manual",
    manualCharacterId: "male-test",
    recommendation: { status: "disabled", body: null, reasonCodes: [] },
    resolvedBody: {
      characterId: "male-test",
      bodyId: "body",
      bodyVersion: "v1",
      assetSha256: "a".repeat(64),
      rigVersion: "v1",
      measurementVersion: "v1",
    },
    resolvedSource: "manual",
    resolutionStatus: "ready",
    selectionRevision: 0,
    previewOnly: true,
  };
  vi.mocked(loadSemanticModel).mockImplementation(async (_c, _s, selection) => ({
    data: new ArrayBuffer(0),
    characterId: selection?.resolvedBody?.characterId ?? "standin-master-v2",
    scope: "full",
  }));
});

let nextJob = 0;
function show(compact = false) {
  const jobId = `job_first_search_${nextJob++}`;
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <SemanticModelPresentation
          presentation={presentation}
          compact={compact}
          bodyContext={{ jobId, person }}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
function unselected() {
  state.selection = {
    ...state.selection!,
    intent: "inherit",
    manualCharacterId: null,
    resolvedBody: null,
    resolvedSource: null,
    resolutionStatus: "needs_selection",
    shape: null,
  };
}

it.each([false, true])(
  "shows a reference for a first search and switches to the chosen body (compact: %s)",
  async (compact) => {
    unselected();
    show(compact);
    expect(
      await screen.findByRole("img", { name: "기본 남성 참고 모델 3D 미리보기" }),
    ).toBeTruthy();
    expect(vi.mocked(loadSemanticModel).mock.calls[0]![2]).toBeUndefined();
    expect(putSelection).not.toHaveBeenCalled();
    expect(screen.getByText("체형 미선택")).toBeTruthy();
    expect(screen.getByText(/체형 선택 전에는 기본 남성 참고 모델/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "체형 더보기" }));
    fireEvent.click(await screen.findByRole("button", { name: /^여성$/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /테스트 여성/ }));
    expect(await screen.findByRole("img", { name: "테스트 여성 모델 3D 미리보기" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "기본 남성 참고 모델 3D 미리보기" })).toBeNull();
    expect(state.selection!.manualCharacterId).toBe("female-test");
  },
);

it.each(["unavailable", "manual", "error"])(
  "does not replace a failed or explicit body with a reference (%s)",
  async (reason) => {
    unselected();
    if (reason === "unavailable") state.selection!.resolutionStatus = "unavailable";
    if (reason === "manual") {
      state.selection!.intent = "manual";
      state.selection!.manualCharacterId = "female-test";
    }
    if (reason === "error") state.error = Error("selection unavailable");
    show();
    await waitFor(() =>
      expect(
        screen.getByText(
          reason === "error"
            ? "체형 선택을 불러오지 못했습니다."
            : "미리보기에 사용할 체형을 선택해 주세요.",
        ),
      ).toBeTruthy(),
    );
    expect(loadSemanticModel).not.toHaveBeenCalled();
  },
);
afterEach(() => useInstallationStore.setState({ credentials: null }));
it("uses persisted body selection, hides the previous surface while changing and renders the chosen female body", async () => {
  let finish!: () => void;
  vi.mocked(loadSemanticModel).mockImplementation(async (_c, _s, selection) => {
    if (selection!.resolvedBody!.characterId === "female-test")
      await new Promise<void>((r) => {
        finish = r;
      });
    return {
      data: new ArrayBuffer(0),
      characterId: selection!.resolvedBody!.characterId,
      scope: "full",
    };
  });
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SemanticModelPresentation
          presentation={presentation}
          bodyContext={{ jobId: "job_test", person }}
          bodyPreviewJob="job_test"
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByRole("img", { name: "테스트 남성 모델 3D 미리보기" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "체형 더보기" }));
  fireEvent.click(await screen.findByRole("button", { name: /^여성$/ }));
  fireEvent.click(await screen.findByRole("radio", { name: /테스트 여성/ }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(screen.queryByRole("img", { name: "테스트 남성 모델 3D 미리보기" })).toBeNull();
  finish();
  expect(await screen.findByRole("img", { name: "테스트 여성 모델 3D 미리보기" })).toBeTruthy();
  expect(state.selection?.selectionRevision).toBe(1);
  expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
});

it("a cached ready teen selection shows retirement guidance without requesting a model", async () => {
  state.selection = {
    ...state.selection!,
    manualCharacterId: "body-teen-male",
    resolvedBody: { ...state.selection!.resolvedBody!, characterId: "body-teen-male" },
  };
  show();
  expect(await screen.findByText(/이 체형은 지원이 종료/)).toBeTruthy();
  expect(screen.getByText("지원 종료 체형")).toBeTruthy();
  expect(loadSemanticModel).not.toHaveBeenCalled();
});
