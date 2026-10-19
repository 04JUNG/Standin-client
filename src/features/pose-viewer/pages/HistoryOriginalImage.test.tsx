import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PoseViewerPage } from "./PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { AnalysisResult } from "../api/pose.contract";
import { ApiError } from "@/shared/api/errors";

const { analyze, loadResult } = vi.hoisted(() => ({ analyze: vi.fn(), loadResult: vi.fn() }));
vi.mock("../api/pose.service", () => ({ poseService: { analyze, loadResult } }));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: vi.fn(),
  currentSurface: () => "app",
  confirmSelections: vi.fn(),
}));
vi.mock("@/features/history/hooks/useJobSelections", () => ({
  useJobSelections: () => ({ data: [] }),
}));
vi.mock("@/features/models/components/ModelSelect", () => ({ ModelSelect: () => null }));
vi.mock("@/features/hand-selection/ReferenceHands", () => ({ ReferenceHands: () => null }));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

const live = "live-a";
const historyB = "job_history-b";
const historyC = "job_history-c";
const original = (id: string) => `https://fixture.invalid/original-${id}.png`;
function result(jobId: string, inputPreviewUrl?: string): AnalysisResult {
  return {
    jobId,
    inputPreviewUrl,
    capabilities: { refine: false, fbxExport: false, characterSelection: false },
    people: [
      {
        index: 0,
        box: [0, 0, 100, 100],
        confidence: "low",
        skeletonState: "partial",
        skeletonSource: "full_image",
        coverageClass: "reduced",
        fallbackMode: "soft",
        refineAllowed: false,
        refinableLimbs: [],
        candidates: [
          {
            id: `candidate-${jobId}`,
            poseId: "pose",
            rank: 1,
            title: `후보 ${jobId}`,
            tags: [],
            matchLevel: "medium",
            thumbnailUrl: "data:image/png;base64,AA==",
            previewImages: [],
            bvhAvailable: true,
          },
        ],
      },
    ],
  };
}
function Controls({ bar }: { bar: boolean }) {
  const navigate = useNavigate();
  return (
    <nav>
      {[live, historyB, historyC].map((id) => (
        <button
          key={id}
          onClick={() => {
            if (bar) usePoseSelectionStore.getState().setJobId(id);
            else navigate(`/app/jobs/${id}`);
          }}
        >
          {id}
        </button>
      ))}
    </nav>
  );
}
function open(mode: "app" | "bar", initial = live) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  usePoseSelectionStore.getState().startJob(initial, null);
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/app/jobs/${initial}`]}>
        <Controls bar={mode === "bar"} />
        <Routes>
          <Route
            path="/app/jobs/:jobId"
            element={mode === "app" ? <PoseViewerPage /> : <BarCandidatesPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
function images(container: HTMLElement) {
  return [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
}
async function seesOriginal(container: HTMLElement, url: string) {
  await waitFor(() => expect(images(container)).toContain(url));
}

beforeEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({ credentials: null });
  useUploadStore.getState().setDraft({
    id: "draft-a",
    source: "file",
    file: new File(["A"], "A.png"),
    previewUrl: original("A"),
    originalName: "A.png",
    mimeType: "image/png",
    width: 100,
    height: 100,
    createdAt: "",
  });
  analyze.mockResolvedValue(result("job_live-a", original("A-server")));
  loadResult.mockImplementation(async ({ jobId }: { jobId: string }) =>
    result(jobId, original(jobId)),
  );
});

it.each(["app", "bar"] as const)(
  "%s: live A → history B → pending C → C → live A keeps each original and draft",
  async (mode) => {
    let finishC!: (value: AnalysisResult) => void;
    loadResult.mockImplementation(({ jobId }: { jobId: string }) =>
      jobId === historyC
        ? new Promise<AnalysisResult>((resolve) => {
            finishC = resolve;
          })
        : Promise.resolve(result(jobId, original(jobId))),
    );
    const draft = useUploadStore.getState().draft;
    const { container } = open(mode);
    await seesOriginal(container, original("A"));
    fireEvent.click(screen.getByRole("button", { name: historyB }));
    await seesOriginal(container, original(historyB));
    expect(images(container)).not.toContain(original("A"));
    fireEvent.click(screen.getByRole("button", { name: historyC }));
    await waitFor(() =>
      expect(loadResult).toHaveBeenCalledWith(expect.objectContaining({ jobId: historyC })),
    );
    expect(images(container)).not.toContain(original("A"));
    expect(images(container)).not.toContain(original(historyB));
    finishC(result(historyC, original(historyC)));
    await seesOriginal(container, original(historyC));
    fireEvent.click(screen.getByRole("button", { name: live }));
    await seesOriginal(container, original("A"));
    expect(images(container)).not.toContain(original(historyC));
    expect(useUploadStore.getState().draft).toBe(draft);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(loadResult.mock.calls.map(([arg]) => arg.jobId)).toEqual([historyB, historyC]);
  },
);

it.each(["app", "bar"] as const)(
  "%s: a missing or mismatched history original never uses another job image",
  async (mode) => {
    loadResult.mockImplementation(async ({ jobId }: { jobId: string }) =>
      jobId === historyB ? result(jobId) : result(historyB, original(historyB)),
    );
    const { container } = open(mode, historyB);
    await screen.findByAltText(`후보 ${historyB}`);
    expect(images(container)).not.toContain(original("A"));
    expect(screen.getAllByText(/원본.*(없거나|없습니다)/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: historyC }));
    await waitFor(() => expect(loadResult).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryAllByText(/원본.*(없거나|없습니다)/).length).toBeGreaterThan(0),
    );
    expect(images(container)).not.toContain(original(historyB));
    expect(images(container)).not.toContain(original("A"));
    expect(analyze).not.toHaveBeenCalled();
  },
);

it.each(["app", "bar"] as const)(
  "%s: expired image failure stays unavailable, then C can load without losing live A",
  async (mode) => {
    const { container } = open(mode, historyB);
    await seesOriginal(container, original(historyB));
    container
      .querySelectorAll(`img[src="${original(historyB)}"]`)
      .forEach((img) => fireEvent.error(img));
    expect(screen.getAllByText("원본 이미지를 불러올 수 없습니다.").length).toBeGreaterThan(0);
    expect(images(container)).not.toContain(original("A"));
    fireEvent.click(screen.getByRole("button", { name: historyC }));
    await seesOriginal(container, original(historyC));
    expect(screen.queryByText("원본 이미지를 불러올 수 없습니다.")).not.toBeInTheDocument();
    expect(useUploadStore.getState().draft?.previewUrl).toBe(original("A"));
    expect(analyze).not.toHaveBeenCalled();
  },
);

it.each(["app", "bar"] as const)(
  "%s: failed history GET retries the same job without analyzing the surviving draft",
  async (mode) => {
    loadResult
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "unavailable"))
      .mockResolvedValueOnce(result(historyB, original(historyB)));
    const { container } = open(mode, historyB);
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(images(container)).not.toContain(original("A"));
    fireEvent.click(retry);
    await seesOriginal(container, original(historyB));
    expect(loadResult.mock.calls.map(([arg]) => arg.jobId)).toEqual([historyB, historyB]);
    expect(analyze).not.toHaveBeenCalled();
    expect(useUploadStore.getState().draft?.previewUrl).toBe(original("A"));
  },
);
