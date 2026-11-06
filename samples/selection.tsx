import {
  loadSolvedPacket,
  prepareSurface,
  solvedCamera,
} from "@/features/pose-viewer/interactive/solved";
import { captureView, registerView } from "@/features/pose-viewer/interactive/renderer";
import { initialObservation } from "@/features/pose-viewer/interactive/camera";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
/* eslint-disable react-refresh/only-export-components -- recorded local QA, excluded from production */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PoseViewerPage } from "@/features/pose-viewer/pages/PoseViewerPage";
import { useInstallationStore } from "@/features/installation/installationStore";
import { bodyMock } from "@/features/body-selection/mock";
import type { BodySelection } from "@/features/body-selection/contract";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { rendererResources } from "@/features/pose-viewer/interactive/renderer";
import "@/app/styles/index.css";
const nativeFetch = window.fetch.bind(window);
type Profile = {
  name: string;
  label: string;
  candidate: string;
  source: string;
  body: { characterId: string; characterSha256: string };
  shape: string | null;
  controls: Record<string, number> | null;
  spec:
    | NonNullable<import("@/features/body-selection/contract").BodyOption["shape"]>["controls"]
    | null;
};
const profiles: Profile[] = await (
  await nativeFetch("/samples/.local-real/body/profiles.json")
).json();
const packets = await Promise.all(
  profiles.map(async (p) =>
    (await nativeFetch(`/samples/.local-real/body/${p.name}.packet.json`)).json(),
  ),
);
const base = profiles[0],
  shaped = profiles[1];
const bodyRef = {
  characterId: base.body.characterId,
  assetSha256: base.body.characterSha256,
  bodyId: "female-recorded",
  bodyVersion: "recorded",
  rigVersion: "mixamo",
  measurementVersion: "recorded",
};
const spec = { schemaVersion: "body-shape.v1" as const, controls: shaped.spec!, basic: 1 };
let profile = 0,
  revision = 1;
const selection = (): BodySelection => ({
  schemaVersion: "body-selection.v1",
  personIndex: 0,
  intent: "manual",
  manualCharacterId: base.body.characterId,
  recommendation: { status: "disabled", body: null, reasonCodes: [] },
  resolvedBody: bodyRef,
  resolvedSource: "manual",
  resolutionStatus: "ready",
  selectionRevision: revision,
  shape: profiles[profile].shape
    ? {
        schemaVersion: "body-shape.v1",
        shapeSha256: profiles[profile].shape!,
        controls: profiles[profile].controls!,
      }
    : null,
});
bodyMock.getSelection = async () => selection();
bodyMock.getOptions = async () => ({
  catalogRevision: "local-recorded",
  characters: [
    {
      characterId: base.body.characterId,
      bodyRef,
      selectable: true,
      reasonCodes: [],
      displayName: "여성 · 기록된 모델",
      shape: spec,
    },
  ],
});
bodyMock.putSelection = async (_job, _person, change) => {
  const controls = change.intent === "manual" ? change.shape?.controls : undefined;
  const next = controls
    ? profiles.findIndex(
        (p) =>
          p.controls &&
          spec.controls.every(
            (c) =>
              Math.abs((controls[c.key] ?? c.default) - (p.controls![c.key] ?? c.default)) < 1e-6,
          ),
      )
    : 0;
  if (next < 0) throw Error("이 견본은 기록된 세 가지 체형만 재생합니다.");
  profile = next;
  revision++;
  return selection();
};
bodyMock.getPreferences = async () => ({
  version: "body-preferences.v1",
  scope: "installation",
  mode: "last_used",
  revision: 1,
  cards: profiles.slice(1).map((p) => ({
    cardId: p.name,
    name: p.label,
    characterId: base.body.characterId,
    controls: p.controls!,
    createdAt: "",
    updatedAt: "",
  })),
});
// One small transient viewport at a time: actual recorded meshes, no procedural card silhouettes.
const thumbs: string[] = [];
for (const packet of packets) {
  const model = await loadSolvedPacket(packet, {
    operationId: packet.operation,
    revision: packet.revision,
    stateHash: packet.stateHash,
    personIndex: 0,
    candidateId: base.candidate,
  });
  const prepared = prepareSurface(model.state.model),
    element = document.createElement("div");
  Object.assign(element.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "140px",
    height: "196px",
  });
  document.body.appendChild(element);
  let unregister: undefined | (() => void);
  try {
    await new Promise<void>((resolve, reject) => {
      unregister = registerView({
        element,
        body: prepared.body.clone(true),
        camera: solvedCamera(model.state, {
          target: [0, 0, 0],
          referenceAspect: 1,
          projectionIncludesCenterScaleCrop: true,
        }),
        observation: initialObservation,
        layer: 0,
        ready: resolve,
        failed: () => reject(Error("recorded thumbnail failed")),
      });
    });
    thumbs.push(await blobToDataUrl(await captureView(element)));
  } finally {
    unregister?.();
    prepared.release();
    element.remove();
  }
}
bodyMock.neutralPreview = async () => thumbs[0];
bodyMock.livePreview = (_id, controls) => {
  const at = profiles.findIndex(
    (p) =>
      p.controls &&
      spec.controls.every(
        (c) =>
          Math.abs((controls?.[c.key] ?? c.default) - (p.controls![c.key] ?? c.default)) < 1e-6,
      ),
  );
  return thumbs[Math.max(0, at)];
};
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  if (url.pathname.endsWith("/selection-preview")) {
    const body = JSON.parse(String(init?.body));
    const current = profile;
    if (body.candidateId !== base.candidate || body.bodyRevision !== revision)
      return new Response("{}", { status: 409 });
    return Response.json({
      schemaVersion: "standin.selection-preview.v1",
      previewOnly: true,
      bodyRevision: revision,
      packet: packets[current],
    });
  }
  if (url.origin === location.origin && !url.pathname.startsWith("/v1/"))
    return nativeFetch(input, init);
  return Response.json({ error: { code: "RECORDED_UI_ONLY" } }, { status: 503 });
};
useInstallationStore.setState({
  credentials: {
    installationId: "local-recorded-owner",
    deviceToken: "local-recorded-only",
    consentVersion: "local",
  },
});
const result: AnalysisResult = {
  jobId: "job_recorded_body_selection",
  source: "image",
  people: [
    {
      index: 0,
      box: [0, 0, 360, 480],
      confidence: "high",
      skeletonSource: "full_image",
      skeletonState: "valid",
      coverageClass: "full",
      fallbackMode: "none",
      refineAllowed: false,
      refinableLimbs: [],
      candidates: [
        {
          id: base.candidate,
          poseId: base.candidate,
          rank: 1,
          title: "기록된 포즈",
          tags: [],
          matchLevel: "high",
          thumbnailUrl: thumbs[0],
          sourceBvhSha256: base.source,
          previewImages: [],
          bvhAvailable: true,
        },
      ],
    },
  ],
  capabilities: {
    refine: false,
    fbxExport: false,
    characterSelection: true,
    modelPreview: false,
    bodyPreviews: true,
    selectionPreview: true,
  },
};
const query = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
query.setQueryData(poseQueryKeys.result(result.jobId), result);
usePoseSelectionStore.getState().startJob(result.jobId, null);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={query}>
      <MemoryRouter initialEntries={[`/app/jobs/${result.jobId}`]}>
        <div className="flex h-screen flex-col">
          <div className="relative z-[70] flex shrink-0 items-center justify-between border-b bg-white px-4 py-2 text-xs">
            <span>실제 모델의 기록된 세 체형 · 연속 조절·검색·저장 미연결</span>
            <a href="/samples/real.html">Top5 견본</a>
            <button onClick={() => alert(JSON.stringify(rendererResources()))}>자원 확인</button>
          </div>
          <div className="min-h-0 flex-1">
            <Routes>
              <Route path="/app/jobs/:jobId" element={<PoseViewerPage />} />
            </Routes>
          </div>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
