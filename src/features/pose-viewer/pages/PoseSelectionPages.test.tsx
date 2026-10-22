import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PoseViewerPage } from "./PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { confirmSelections } from "@/features/analytics/analyticsClient";
import { getManifest } from "@/features/body-selection/api";
import { poseQueryKeys } from "../queryKeys";
import type { AnalysisResult } from "../api/pose.contract";

const bodySelection = vi.hoisted(() => ({
  schemaVersion: "body-selection.v1",
  personIndex: 0,
  intent: "manual",
  manualCharacterId: "female-new",
  recommendation: { status: "disabled", body: null, reasonCodes: [] },
  resolvedBody: {
    characterId: "female-new",
    bodyId: "female",
    bodyVersion: "v1",
    assetSha256: "b".repeat(64),
    rigVersion: "v1",
    measurementVersion: "v1",
  },
  resolvedSource: "manual",
  resolutionStatus: "ready",
  selectionRevision: 2,
  shape: { schemaVersion: "body-shape.v1", controls: { height: 168 }, shapeSha256: "c".repeat(64) },
}));
vi.mock("@/features/body-selection/api", async (original) => ({
  ...(await original<typeof import("@/features/body-selection/api")>()),
  getSelection: vi.fn(async () => bodySelection),
  getManifest: vi.fn(async () => ({
    outputScope: "full",
    candidates: Array.from({ length: 5 }, (_, i) => ({ candidateId: `pick-${i}` })),
  })),
  renderBodyCandidate: vi.fn(async (_m, c) => `data:image/png;base64,${btoa(c.candidateId)}`),
  getOptions: vi.fn(async () => ({
    characters: [{ characterId: "female-new", displayName: "테스트 여성" }],
  })),
  getPreferences: vi.fn(async () => ({ cards: [] })),
}));
vi.mock("../components/DefaultPoseImage", () => ({
  DefaultPoseImage: ({ candidate }: { candidate: { rank: number } }) => (
    <img src="data:image/png;base64,AA==" alt={`후보 이미지 ${candidate.rank}`} />
  ),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { characters: [] } }),
}));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: vi.fn(),
  currentSurface: () => "app",
  confirmSelections: vi.fn(),
}));
vi.mock("@/features/models/components/ModelSelect", () => ({ ModelSelect: () => null }));
vi.mock("@/features/hand-selection/ReferenceHands", () => ({
  ReferenceHands: () => <div data-testid="candidate-hand-library">후보 손 라이브러리</div>,
}));
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

beforeEach(() => {
  vi.mocked(confirmSelections).mockClear();
  useInstallationStore.setState({ credentials: null });
  vi.mocked(getManifest).mockClear();
  usePoseSelectionStore.getState().startJob("click-test", null);
  usePoseSelectionStore.setState({ selectedByPerson: {}, excludedPeople: {} });
  useUploadStore.getState().setDraft({
    id: "rough",
    source: "file",
    file: new File(["png"], "rough.png"),
    previewUrl: "",
    originalName: "rough.png",
    mimeType: "image/png",
    width: 100,
    height: 100,
    createdAt: "",
  });
});

it.each([
  ["app", false, 1],
  ["bar", false, 1],
  ["app", true, 1],
  ["app", true, 3],
  ["bar", true, 1],
  ["bar", true, 2],
] as const)(
  "%s body=%s people=%s: selects poses and keeps each body panel independent",
  async (mode, bodyMode, personCount) => {
    if (bodyMode)
      useInstallationStore.setState({
        credentials: { installationId: "owner", deviceToken: "test", consentVersion: "test" },
      });
    const client = new QueryClient();
    const data: AnalysisResult = {
      jobId: "job-click",
      capabilities: {
        refine: false,
        fbxExport: true,
        characterSelection: false,
        bodyPreviews: bodyMode,
        presentationBodyPreviews: bodyMode,
      },
      people: [
        {
          index: 0,
          confidence: "low",
          skeletonState: "valid",
          skeletonSource: "full_image",
          coverageClass: "full",
          fallbackMode: "soft",
          refineAllowed: false,
          refinableLimbs: [],
          posePresentation: {
            version: "dynamic-pose-presentation-v1",
            person_index: 0,
            route: "hybrid",
            status: "ready",
            search_status: "ok",
            search_reason: null,
            generation_status: null,
            generation_reason: null,
            output_scope: "full",
            unobserved_body_is_default: null,
            library_candidates: [],
            review_candidates: [],
            generated_candidates: [],
            basic_model: null,
            issues: [],
            preview_status: "ready",
            auto_apply_allowed: false,
            refine_allowed: false,
            export_allowed: false,
          },
          candidates: Array.from({ length: 5 }, (_, i) => ({
            id: `pick-${i}`,
            poseId: `pose-${i}`,
            rank: i + 1,
            title: `포즈 ${i + 1}`,
            tags: [],
            matchLevel: "medium",
            thumbnailUrl: "data:image/png;base64,AA==",
            previewImages: [],
            bvhAvailable: true,
            source: "library",
            lookupAllowed: true,
            releaseAllowed: true,
            sourceBvhSha256: "a".repeat(64),
          })),
        },
      ],
    };
    if (personCount >= 2) {
      const first = data.people[0];
      data.people.push({
        ...first,
        index: 1,
        posePresentation: first.posePresentation
          ? { ...first.posePresentation, person_index: 1 }
          : undefined,
        candidates: first.candidates.map((candidate) => ({
          ...candidate,
          id: `second-${candidate.id}`,
        })),
      });
    }
    if (personCount === 3) {
      const reference = data.people[0];
      data.people.push({
        ...reference,
        index: 2,
        candidates: [],
        posePresentation: reference.posePresentation
          ? { ...reference.posePresentation, person_index: 2 }
          : undefined,
      });
    }
    client.setQueryData(poseQueryKeys.result("click-test"), data);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/jobs/click-test"]}>
          <Routes>
            <Route
              path="/app/jobs/:jobId"
              element={mode === "app" ? <PoseViewerPage /> : <BarCandidatesPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const first =
      mode === "bar" ? within(await screen.findByRole("region", { name: "인물 1" })) : screen;
    await first.findByAltText("포즈 1");
    expect(screen.queryByTestId("candidate-hand-library")).toBeNull();
    if (bodyMode) {
      expect(getManifest).not.toHaveBeenCalled();
      expect(first.getByAltText("포즈 1")).toHaveAttribute("src", "data:image/png;base64,AA==");
    }
    for (let i = 0; i < 5; i++) {
      fireEvent.click(first.getByAltText(`포즈 ${i + 1}`));
      expect(usePoseSelectionStore.getState().selectedByPerson[0]).toBe(`pick-${i}`);
      expect(first.getByAltText(`포즈 ${i + 1}`).closest("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    if (mode === "app" && personCount === 3) {
      const index = within(screen.getByRole("navigation", { name: "인물 목록" }));
      // Active and reference-only people remain in the complete ordered index.
      expect(
        index
          .getAllByRole("button", { name: /인물 \d+ 펼치기/ })
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["인물 1 펼치기", "인물 2 펼치기", "인물 3 펼치기"]);
      expect(screen.getAllByRole("switch")).toHaveLength(2);
      expect(
        within(screen.getByRole("region", { name: "인물 1 후보" })).queryByRole("switch"),
      ).toBeNull();
      expect(index.getByRole("button", { name: "인물 1 펼치기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      fireEvent.click(index.getByRole("button", { name: "인물 2 펼치기" }));
      expect(index.getByRole("button", { name: "인물 2 펼치기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(index.getAllByRole("button", { name: /인물 \d+ 펼치기/ })).toHaveLength(3);
      fireEvent.click(screen.getByRole("button", { name: "체형 더보기" }));
      expect(await screen.findByRole("region", { name: "인물 2 체형 선택" })).toBeVisible();
      expect(index.getAllByRole("button", { name: /인물 \d+ 펼치기/ })).toHaveLength(3);
      fireEvent.click(index.getByRole("switch", { name: "인물 2 선택" }));
      expect(index.getByRole("button", { name: "인물 2 펼치기" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      fireEvent.click(index.getByRole("switch", { name: "인물 2 선택" }));
      fireEvent.click(screen.getByRole("button", { name: "포즈" }));
      fireEvent.click(screen.getByAltText("포즈 2"));
      expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({
        0: "pick-4",
        1: "second-pick-1",
      });
      fireEvent.click(index.getByRole("button", { name: "인물 3 펼치기" }));
      expect(screen.getByRole("region", { name: "인물 3 후보" })).toBeVisible();
      expect(index.getAllByRole("button", { name: /인물 \d+ 펼치기/ })).toHaveLength(3);
      fireEvent.click(index.getByRole("button", { name: "인물 1 펼치기" }));
      expect(screen.getByAltText("포즈 5").closest("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // Keep the current view when switching, even through a reference-only person.
      fireEvent.click(screen.getByRole("button", { name: "체형 더보기" }));
      expect(await screen.findByRole("region", { name: "인물 1 체형 선택" })).toBeVisible();
      fireEvent.click(index.getByRole("button", { name: "인물 3 펼치기" }));
      expect(screen.queryByRole("region", { name: "인물 3 체형 선택" })).toBeNull();
      fireEvent.click(index.getByRole("button", { name: "인물 2 펼치기" }));
      expect(await screen.findByRole("region", { name: "인물 2 체형 선택" })).toBeVisible();
      fireEvent.click(index.getByRole("button", { name: "인물 1 펼치기" }));
      expect(screen.getByRole("region", { name: "인물 1 체형 선택" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "포즈" }));
      fireEvent.click(index.getByRole("button", { name: "인물 2 펼치기" }));
      expect(screen.queryByRole("region", { name: "인물 2 체형 선택" })).toBeNull();
      fireEvent.click(index.getByRole("button", { name: "인물 1 펼치기" }));
    }
    if (personCount === 2) {
      const second = within(screen.getByRole("region", { name: "인물 2" }));
      expect(screen.getByRole("button", { name: /이 포즈 사용/ })).toBeDisabled();
      fireEvent.click(first.getByRole("button", { name: "체형 더보기" }));
      expect(await first.findByRole("region", { name: "인물 1 체형 선택" })).toBeVisible();
      expect(second.queryByRole("region", { name: "인물 2 체형 선택" })).toBeNull();
      fireEvent.click(second.getByAltText("포즈 2"));
      fireEvent.click(second.getByRole("button", { name: "체형 더보기" }));
      expect(await second.findByRole("region", { name: "인물 2 체형 선택" })).toBeVisible();
      fireEvent.click(first.getByRole("button", { name: "포즈" }));
      expect(first.queryByRole("region", { name: "인물 1 체형 선택" })).toBeNull();
      expect(second.getByRole("region", { name: "인물 2 체형 선택" })).toBeVisible();
      expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({
        0: "pick-4",
        1: "second-pick-1",
      });
      // Leave the persisted body-panel state closed for subsequent route tests.
      fireEvent.click(second.getByRole("button", { name: "포즈" }));
    }
    expect(screen.getByRole("button", { name: /이 포즈 사용/ })).toBeEnabled();
  },
);

it.each([
  ["app", "near_match", false],
  ["bar", "near_match", false],
  ["app", "generated_review", false],
  ["bar", "generated_review", false],
  ["app", "generated_mixed", false],
  ["bar", "generated_mixed", false],
  ["app", "mirror_reference", false],
  ["bar", "mirror_reference", false],
  ["app", "library_match", true],
  ["bar", "library_match", true],
] as const)(
  "%s manually selects %s (text=%s), confirms the actual id, and reaches final review",
  async (mode, kind, semantic) => {
    const id = "preview-manual",
      hash = "d".repeat(64);
    const presentation = {
      version: semantic ? "semantic-pose-presentation-v1" : "dynamic-pose-presentation-v1",
      person_index: 0,
      route: "hybrid",
      status: "partial_error",
      search_status: "partial_error",
      search_reason: "hand_skin_screen_unavailable_no_generation",
      generation_status: "not_requested",
      generation_reason: null,
      output_scope: "half",
      unobserved_body_is_default: true,
      library_candidates: [],
      generated_candidates: [],
      review_candidates: [
        {
          candidate_id: id,
          pose_id: "real-bvh",
          kind,
          source: "library",
          rank: 1,
          asset: { transport: "library_bvh", bvh_sha256: hash, preview_bvh_url: "/v1/manual" },
          render_camera: {},
        },
      ],
      basic_model: null,
      issues: [],
      preview_status: "ready",
    } as unknown as import("../api/posePresentation").PosePresentation;
    const data = {
      jobId: "job_manual",
      ...(semantic ? { source: "semantic", semantic: { query: "팔을 든 자세", index: {} } } : {}),
      capabilities: { refine: false, fbxExport: true, characterSelection: false },
      people: [
        {
          index: 0,
          candidates: [
            {
              id,
              poseId: "real-bvh",
              source: semantic ? "semantic" : "library",
              rank: 1,
              title: "직접 선택 포즈",
              tags: [],
              matchLevel: "low",
              thumbnailUrl: "",
              previewImages: [],
              bvhAvailable: true,
              sourceBvhSha256: hash,
              lookupAllowed: true,
              releaseAllowed: false,
              manualExportAllowed: true,
              refineAllowed: false,
              presentationKind: kind,
            },
          ],
          fallbackMode: "soft",
          confidence: "low",
          skeletonState: "missing",
          skeletonSource: "none",
          coverageClass: "insufficient",
          refineAllowed: false,
          refinableLimbs: [],
          posePresentation: presentation,
        },
      ],
    } as AnalysisResult;
    const mixed = kind === "generated_mixed";
    const libraryPerson = structuredClone(data.people[0]);
    if (kind === "generated_review" || mixed) {
      const p = data.people[0],
        c = p.candidates[0];
      c.presentationKind = "generated_review";
      c.source = "generation";
      c.poseId = null;
      presentation.generated_candidates = presentation.review_candidates;
      presentation.review_candidates = [];
      const row = presentation.generated_candidates[0];
      row.kind = "generated_review";
      row.source = "generation";
      row.pose_id = null;
      row.asset.transport = "inline_bvh";
      presentation.generation_status = "preview_ready";
      presentation.search_status = "no_result";
    }
    if (mixed) {
      libraryPerson.index = 1;
      libraryPerson.candidates[0].presentationKind = "near_match";
      libraryPerson.posePresentation!.person_index = 1;
      libraryPerson.posePresentation!.review_candidates[0].kind = "near_match";
      data.people.push(libraryPerson);
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(poseQueryKeys.result("click-test"), data);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/jobs/click-test"]}>
          <Routes>
            <Route
              path="/app/jobs/:jobId"
              element={mode === "app" ? <PoseViewerPage /> : <BarCandidatesPage />}
            />
            <Route path="/app/jobs/:jobId/review" element={<p>최종 파일 확인</p>} />
            <Route path="/bar/review" element={<p>최종 파일 확인</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const firstPerson =
      mode === "bar" ? within(screen.getByRole("region", { name: "인물 1" })) : screen;
    const pick = await firstPerson.findByRole("button", { name: /1번 .* 이미지로 선택/ });
    expect(screen.queryByTestId("candidate-hand-library")).toBeNull();
    expect(screen.queryByText(/이 장면에는 사용할 수 있는/)).toBeNull();
    expect(screen.getByRole("button", { name: /이 포즈 사용/ })).toBeDisabled();
    fireEvent.click(await firstPerson.findByAltText("후보 이미지 1"));
    expect(screen.queryByRole("button", { name: /크게 보기|확대/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /이미지 확대/ })).toBeNull();
    expect(usePoseSelectionStore.getState().selectedByPerson[0]).toBe(id);
    expect(pick).toHaveAttribute("aria-pressed", "true");
    expect(getManifest).not.toHaveBeenCalled();
    if (mixed) {
      if (mode === "bar") {
        expect(screen.queryByRole("button", { name: /이전 인물|다음 인물/ })).toBeNull();
        const secondPerson = within(screen.getByRole("region", { name: "인물 2" }));
        expect(firstPerson.getByRole("switch", { name: "인물 1 선택" })).toBeChecked();
        const secondSwitch = secondPerson.getByRole("switch", { name: "인물 2 선택" });
        fireEvent.click(secondSwitch);
        expect(screen.getByRole("button", { name: /이 포즈 사용/ })).toBeEnabled();
        expect(secondPerson.getByRole("button", { name: /1번 .* 이미지로 선택/ })).toBeDisabled();
        fireEvent.click(secondSwitch);
        expect(screen.getByRole("button", { name: /이 포즈 사용/ })).toBeDisabled();
        fireEvent.click(secondPerson.getByRole("button", { name: /1번 .* 이미지로 선택/ }));
        expect(firstPerson.getByRole("button", { name: /1번 .* 이미지로 선택/ })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      } else {
        fireEvent.click(screen.getByRole("button", { name: /다음 인물로/ }));
        fireEvent.click(await screen.findByRole("button", { name: /1번 .* 이미지로 선택/ }));
      }
      expect(usePoseSelectionStore.getState().selectedByPerson).toMatchObject({ 0: id, 1: id });
    }
    fireEvent.click(screen.getByRole("button", { name: /이 포즈 사용/ }));
    await waitFor(() =>
      expect(confirmSelections).toHaveBeenCalledWith("job_manual", [
        { personIndex: 0, candidateId: id },
        ...(mixed ? [{ personIndex: 1, candidateId: id }] : []),
      ]),
    );
    await screen.findByText("최종 파일 확인");
  },
);

it.each(["app", "bar"] as const)(
  "%s keeps empty presentations distinct from real reference poses after the layout merge",
  async (mode) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const presentation = {
      version: "dynamic-pose-presentation-v1",
      person_index: 0,
      route: "hybrid",
      status: "error",
      search_status: "error",
      search_reason: "hand_skin_screen_unavailable_no_generation",
      generation_status: "not_requested",
      generation_reason: null,
      output_scope: "full",
      unobserved_body_is_default: null,
      library_candidates: [],
      review_candidates: [],
      generated_candidates: [],
      basic_model: null,
      issues: [],
      preview_status: "unavailable",
      auto_apply_allowed: false,
      refine_allowed: false,
      export_allowed: false,
    } as const;
    const data = {
      jobId: "empty-layout-test",
      capabilities: { refine: false, fbxExport: true, characterSelection: false },
      people: [
        {
          index: 0,
          confidence: "low",
          skeletonState: "missing",
          skeletonSource: "none",
          coverageClass: "insufficient",
          fallbackMode: "hard",
          refineAllowed: false,
          refinableLimbs: [],
          candidates: [],
          posePresentation: presentation,
        },
      ],
    } as unknown as AnalysisResult;
    client.setQueryData(poseQueryKeys.result("click-test"), data);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/jobs/click-test"]}>
          <Routes>
            <Route
              path="/app/jobs/:jobId"
              element={mode === "app" ? <PoseViewerPage /> : <BarCandidatesPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    for (const notice of await screen.findAllByText(/포즈 확인을 마치지 못했어요/))
      expect(notice).toBeVisible();
    expect(screen.getAllByText("후보 없음").length).toBeGreaterThan(0);
    expect(screen.queryByText("참고용 포즈")).toBeNull();
    expect(screen.queryByText("참고 포즈 펼치기")).toBeNull();
    expect(screen.queryByText("참고용 미리보기")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();

    const next = structuredClone(data);
    next.people[0].posePresentation!.search_status = "no_result";
    next.people[0].posePresentation!.search_reason = null;
    next.people[0].posePresentation!.review_candidates = [
      {
        candidate_id: "reference-only",
        pose_id: "pose-reference",
        kind: "near_match",
        source: "library",
        rank: 1,
        asset: {
          transport: "library_bvh",
          bvh_sha256: "a".repeat(64),
          preview_bvh_url: "/v1/reference",
        },
        render_camera: {},
      } as unknown as import("../api/posePresentation").PreviewCandidate,
    ];
    client.setQueryData(poseQueryKeys.result("click-test"), next);
    expect(await screen.findByAltText("후보 이미지 1")).toBeVisible();
    expect(screen.getByText("참고용 미리보기")).toBeVisible();
    if (mode === "app") expect(screen.getByText("참고 포즈 펼치기")).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
  },
);
