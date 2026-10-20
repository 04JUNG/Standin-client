import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { ReferenceHands } from "./ReferenceHands";
import { readOutputScope } from "@/features/pose-viewer/api/outputScope";
const state = vi.hoisted(() => ({
  hand: { revision: 1, library_sha256: "a".repeat(64) },
  load: vi.fn(),
}));
vi.mock("./hooks", () => ({
  useHands: () => ({
    enabled: true,
    ready: true,
    entries: [{ personIndex: 0, selection: state.hand }],
  }),
}));
vi.mock("./HandChips", () => ({ HandChips: () => <div>손 선택 패널</div> }));
vi.mock("@/shared/api/client", () => ({
  apiFetchResponse: (...args: unknown[]) => state.load(...args),
}));
vi.mock("@/features/pose-viewer/api/thumbnails", () => ({
  blobToDataUrl: async () => "data:image/png;base64,fixture",
}));
const candidate = {
  candidate_id: "preview_" + "b".repeat(64),
  rank: 1,
  asset: {
    preview_bvh_url:
      "/v1/analysis/jobs/job_test/people/0/pose-previews/preview_" +
      "b".repeat(64) +
      "/" +
      "c".repeat(64),
  },
};
const result = {
  jobId: "job_test",
  people: [
    {
      index: 0,
      posePresentation: {
        library_candidates: [candidate],
        review_candidates: [],
        generated_candidates: [],
      },
    },
  ],
  capabilities: { handSelection: true },
} as unknown as AnalysisResult;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (data = result) => (
    <QueryClientProvider client={client}>
      <ReferenceHands result={data} personIndex={0} />
    </QueryClientProvider>
  );
  return { ...render(view()), view };
}
beforeEach(() => {
  state.hand = { revision: 1, library_sha256: "a".repeat(64) };
  state.load.mockReset();
  state.load.mockImplementation(
    async () =>
      new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        headers: {
          "Content-Type": "image/png",
          "X-Standin-Preview-Only": "true",
          "X-Standin-Hand-Revision": "1",
          "X-Standin-Hand-Library-SHA256": "a".repeat(64),
        },
      }),
  );
});
it("requires explicit candidate and preview click, and invalidates the image after a hand revision", async () => {
  const { rerender, view } = mount();
  expect(state.load).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "손 적용 미리보기" })).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox", { name: "손 미리보기 후보" }), {
    target: { value: candidate.candidate_id },
  });
  expect(state.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "손 적용 미리보기" }));
  await screen.findByAltText("고른 손 모양을 기본 체형에 적용한 정면 모습");
  expect(state.load.mock.calls[0][0]).toContain("/hands?revision=1");
  state.hand = { ...state.hand, revision: 2 };
  rerender(view());
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(state.load).toHaveBeenCalledTimes(1);
});
it("rejects a stale preview receipt instead of showing the old hand image", async () => {
  state.load.mockResolvedValue(
    new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
      headers: {
        "Content-Type": "image/png",
        "X-Standin-Preview-Only": "true",
        "X-Standin-Hand-Revision": "0",
        "X-Standin-Hand-Library-SHA256": "a".repeat(64),
      },
    }),
  );
  mount();
  fireEvent.change(screen.getByRole("combobox", { name: "손 미리보기 후보" }), {
    target: { value: candidate.candidate_id },
  });
  fireEvent.click(screen.getByRole("button", { name: "손 적용 미리보기" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("hides an old hand image after the output scope changes", async () => {
  const { rerender, view } = mount();
  fireEvent.change(screen.getByRole("combobox", { name: "손 미리보기 후보" }), {
    target: { value: candidate.candidate_id },
  });
  fireEvent.click(screen.getByRole("button", { name: "손 적용 미리보기" }));
  await screen.findByRole("img");
  rerender(
    view({
      ...result,
      people: result.people.map((p) => ({
        ...p,
        outputScope: {
          ...readOutputScope(undefined),
          selection: "half",
          resolved: "half",
          resolutionSource: "user",
        },
      })),
    }),
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(state.load).toHaveBeenCalledTimes(1);
});
