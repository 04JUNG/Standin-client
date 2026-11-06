import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useSaveFlow } from "@/features/export/hooks/useSaveFlow";
import { useExportStore } from "@/features/export/store/exportStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { saveConsentBinding } from "@/features/export/lib/saveBinding";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import type { LocalModel } from "./contract";
import { localBinding } from "./prepare";
import { localSelectionKey, useLocalBodies } from "./store";
const mock = vi.hoisted(() => ({ pose: vi.fn(), save: vi.fn() }));
vi.mock("./prepare", async (original) => ({
  ...(await original<typeof import("./prepare")>()),
  finalPose: mock.pose,
}));
vi.mock("@/shared/lib/env", () => ({
  env: { useMockPoseApi: false, isProduction: false, interactivePreview: true },
}));
vi.mock("@/features/export/api/export.service", () => ({
  exportService: { saveCandidates: mock.save },
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { defaultCharacterId: "base", characters: [] } }),
}));
const model: LocalModel = {
  localModelId: "00000000-0000-4000-8000-000000000001",
  name: "private card",
  sourceHash: "a".repeat(64),
  format: "cs3c",
  version: 1,
  importerVersion: "2",
  normalizationVersion: "3",
  rigMappingVersion: "2",
  converterVersion: "3",
  createdAt: 1,
  updatedAt: 1,
  capabilities: { bodyPose: true, leftHand: false, rightHand: false },
};
const candidate = {
  id: "pick",
  poseId: "pose",
  source: "library" as const,
  releaseAllowed: true,
  lookupAllowed: true,
  bvhAvailable: true,
  sourceBvhSha256: "b".repeat(64),
  bvhUrl: "/v1/pose-candidates/pose/export?jobId=job&personIndex=0&candidateId=pick",
  presentationCamera: {
    version: "candidate-camera-v2",
    sourceBvhSha256: "b".repeat(64),
    rotation: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.save.mockResolvedValue([{ path: "/fixture/output.fbx" }]);
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "fixture", consentVersion: "v" },
  });
  useExportStore.setState({
    jobId: "job",
    folder: "/fixture",
    fileName: "pose.fbx",
    format: "fbx",
    status: "idle",
    savedPaths: [],
    error: null,
    partialConsentBinding: undefined,
    individualConsentBinding: undefined,
  });
  usePoseSelectionStore.setState({
    jobId: "job",
    selectedByPerson: { 0: "pick" },
    excludedPeople: {},
    refineByPerson: {},
    characterByPerson: {},
    characterId: null,
    outlineByPerson: {},
    skinByPerson: {},
    outlineEditingByPerson: {},
  });
  useLocalBodies.setState({
    models: [model],
    selected: { [localSelectionKey("job", 0)]: model.localModelId },
    scroll: {},
  });
});
function mount() {
  const qc = new QueryClient();
  const analysis = {
    jobId: "job",
    capabilities: {
      fbxExport: true,
      interactivePreview: { operations: true },
      sceneExport: false,
      handSelection: false,
      bodyPreviews: false,
      outputScopeCropping: false,
    },
    people: [{ index: 0, candidates: [candidate] }],
  } as unknown as AnalysisResult;
  qc.setQueryData(poseQueryKeys.result("job"), analysis);
  const item = {
    personIndex: 0,
    candidate: analysis.people[0]!.candidates[0]!,
    exportUrl: candidate.bvhUrl,
    refined: false,
    skipped: true,
    previewUrl: "",
  };
  const binding = localBinding(model, item, "full", undefined);
  qc.setQueryData(["personal-body-result", "owner", "job", binding], {
    binding,
    content: new Uint8Array([7, 8, 9]),
    snapshotHash: "c".repeat(64),
    artifactHash: "d".repeat(64),
    poseHash: "e".repeat(64),
  });
  const hook = renderHook(() => useSaveFlow("job"), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, qc, analysis };
}
it("saves the exact reviewed personal FBX via individual autosave when scene is disabled", async () => {
  mock.pose.mockResolvedValue({ hash: "e".repeat(64), bytes: new Uint8Array([1]) });
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("saved"));
  expect(mock.save).toHaveBeenCalledTimes(1);
  expect(mock.save.mock.calls[0][0].files[0].content).toEqual(new Uint8Array([7, 8, 9]));
});
for (const change of ["camera", "replacement", "rename", "delete", "person-selection"] as const) {
  it(`never writes a prepared FBX after ${change} changes during final BVH verification`, async () => {
    let finish: (v: unknown) => void = () => {};
    mock.pose.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { qc, analysis, result } = mount();
    await waitFor(() => expect(mock.pose).toHaveBeenCalledTimes(1));
    act(() => {
      if (change === "camera")
        qc.setQueryData(poseQueryKeys.result("job"), {
          ...analysis,
          people: [
            {
              ...analysis.people[0],
              candidates: [
                {
                  ...candidate,
                  presentationCamera: {
                    ...candidate.presentationCamera,
                    rotation: [
                      [0, 0, 1],
                      [0, 1, 0],
                      [-1, 0, 0],
                    ],
                  },
                },
              ],
            },
          ],
        });
      else if (change === "replacement")
        useLocalBodies.getState().setModels([{ ...model, version: 2 }]);
      else if (change === "rename")
        useLocalBodies.getState().setModels([{ ...model, name: "renamed private card" }]);
      else if (change === "delete") useLocalBodies.getState().setModels([]);
      else usePoseSelectionStore.setState({ selectedByPerson: { 0: "other" } });
    });
    await act(async () => finish({ hash: "e".repeat(64), bytes: new Uint8Array([1]) }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(useExportStore.getState().errorCode).toBe("PREVIEW_CHANGED");
    expect(mock.save).not.toHaveBeenCalled();
  });
}
it("invalidates an earlier save consent when a selected local model is replaced", () => {
  mock.pose.mockImplementation(() => new Promise(() => {}));
  const { qc } = mount();
  const before = saveConsentBinding(qc, "job");
  act(() => useLocalBodies.getState().setModels([{ ...model, version: 2 }]));
  expect(saveConsentBinding(qc, "job")).not.toBe(before);
});

it("saves original personal bytes while retaining separate built-in skin and outline choices", async () => {
  usePoseSelectionStore.setState({
    outlineByPerson: { 0: 2 },
    skinByPerson: { 0: "flesh" },
    outlineEditingByPerson: { 0: true },
  });
  mock.pose.mockResolvedValue({ hash: "e".repeat(64), bytes: new Uint8Array([1]) });
  const { result } = mount();
  await waitFor(() => expect(result.current.status).toBe("saved"));
  expect(mock.save.mock.calls[0][0].files[0].content).toEqual(new Uint8Array([7, 8, 9]));
  expect(usePoseSelectionStore.getState().skinByPerson[0]).toBe("flesh");
});
