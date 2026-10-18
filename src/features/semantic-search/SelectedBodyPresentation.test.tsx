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
const state = vi.hoisted(() => ({ selection: null as BodySelection | null }));
vi.mock("./modelPreview", () => ({ loadSemanticModel: vi.fn() }));
vi.mock("@/features/body-selection/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/body-selection/api")>()),
  getSelection: vi.fn(async () => state.selection),
  putSelection: vi.fn(async (_j, _p, change) => {
    state.selection = {
      ...state.selection!,
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
    characterId: selection!.resolvedBody!.characterId,
    scope: "full",
  }));
});
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
