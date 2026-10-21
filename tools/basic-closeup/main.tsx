// Real BFF mapper/template proxy + real app panel/WebGL, synthetic job metadata.
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosePresentationPanel } from "../../src/features/pose-viewer/components/PosePresentationPanel";
import { useInstallationStore } from "../../src/features/installation/installationStore";
import type { PosePresentation } from "../../src/features/pose-viewer/api/posePresentation";
import { setInstallationCredentials } from "../../src/shared/api/client";
import "../../src/app/styles/index.css";
const credentials = {
  installationId: "local-closeup-fixture",
  deviceToken: "fixture-only",
  consentVersion: "fixture",
};
setInstallationCredentials(credentials);
useInstallationStore.setState({ credentials });
const scopes = ["shoulder_head", "head"];
const results: PosePresentation[] = await Promise.all(
  scopes.map((scope) => fetch(`/fixture/result/${scope}`).then((r) => r.json())),
);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-bold">기본 클로즈업 · 로컬 실제 메시 확인</h1>
      <p>합성 Job 메타 · 승인된 실제 기본 모델 · 원격 분석/Converter 호출 없음</p>
      <div className="grid grid-cols-2 gap-4">
        {results.map((p) => (
          <PosePresentationPanel key={p.output_scope} presentation={p} />
        ))}
      </div>
      <h2>플로팅 바 공통 패널</h2>
      <PosePresentationPanel presentation={results[0]} compact />
    </main>
  </QueryClientProvider>,
);
