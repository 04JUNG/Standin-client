/** Recorded actual client/BFF results -> production UI components -> production native adapter.
 * This local evidence stage never claims a single live app/BFF/native transaction. */
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../../src/shared/components/AppShell";
import { BarShell } from "../../src/features/bar/components/BarShell";
import { WindowModeSync } from "../../src/features/bar/components/WindowModeSync";
import {
  InteractiveReview,
  type InteractiveReviewData,
} from "../../src/features/pose-viewer/interactive/InteractiveReview";
import {
  checkOperation,
  type ModelResult,
  type Operation,
} from "../../src/features/pose-viewer/interactive/http";
import { loadSolvedPacket, frameSchema } from "../../src/features/pose-viewer/interactive/solved";
import { SkinControl } from "../../src/features/pose-viewer/skin/SkinControl";
import { OutlineControl } from "../../src/features/pose-viewer/outline/OutlineControl";
import { SKIN_CHOICES } from "../../src/features/pose-viewer/skin/skinChoices";
import { selectedSkin, sameSkin } from "../../src/features/pose-viewer/skin/skin";
import { usePoseSelectionStore } from "../../src/features/pose-viewer/store/poseSelectionStore";
import { verifyBytes } from "../../src/features/pose-viewer/interactive/assets";
import { exportTauri } from "../../src/features/export/api/export.tauri";
import "../../src/app/styles/index.css";
const available = SKIN_CHOICES.map((s) => s.id);
usePoseSelectionStore.getState().startJob("skin-native-qa", null);
usePoseSelectionStore.getState().setPersonSkin(0, "flesh-guide");
usePoseSelectionStore.getState().setPersonOutline(0, 2);
export default function App() {
  const navigate = useNavigate(),
    bar = useLocation().pathname.startsWith("/bar");
  const skin = usePoseSelectionStore((s) => s.skinByPerson[0] ?? "default");
  const width = usePoseSelectionStore((s) => s.outlineByPerson[0] ?? 0);
  const [loaded, setLoaded] = useState<{ key: string; op: Operation; model: ModelResult }>();
  const [notice, setNotice] = useState("기록한 실제 결과 불러오는 중"),
    [ready, setReady] = useState(false);
  const key = skin === "default" ? "flesh-guide" : skin;
  useEffect(() => {
    const abort = new AbortController();
    setLoaded(undefined);
    setReady(false);
    setNotice("기록한 실제 결과 불러오는 중");
    void (async () => {
      const response = await fetch(`/qa/${key}/operation`, { signal: abort.signal });
      if (!response.ok) throw Error("recorded operation unavailable");
      const raw = await response.json(),
        match = raw.modelUrl?.match(/^\/v1\/analysis\/jobs\/([^/]+)\/people\/(\d+)\//);
      if (!match) throw Error("operation target");
      const op = checkOperation(raw, {
        jobId: decodeURIComponent(match[1]),
        personIndex: Number(match[2]),
      });
      const packet = await (await fetch(`/qa/${key}/packet`, { signal: abort.signal })).json();
      const model = await loadSolvedPacket(packet, {
        operationId: op.operationId,
        revision: op.revision,
        stateHash: op.stateHash!,
        personIndex: Number(match[2]),
        candidateId: op.candidateId,
      });
      if (model.state.identity.solver.adapterVersion !== "post-frozen-file-canonical-snapshot-v2")
        throw Error("frame adapter");
      abort.signal.throwIfAborted();
      setLoaded({
        key,
        op,
        model: {
          ...model,
          frame: frameSchema.parse({
            target: [0, 0, 0],
            referenceAspect: 1,
            projectionIncludesCenterScaleCrop: true,
          }),
        },
      });
      setNotice("기록한 실제 BFF 결과 · 미리보기와 native 저장을 별도로 확인하는 로컬 검사");
    })().catch((e) => {
      if (!abort.signal.aborted) setNotice(String(e.message));
    });
    return () => abort.abort();
  }, [key]);
  const data = useMemo<InteractiveReviewData>(
    () => ({
      model: loaded?.key === key ? loaded.model : undefined,
      skin: selectedSkin(skin),
      skinPreview: loaded?.op.skinPreview,
      skinState: loaded?.op.stateHash
        ? { stateHash: loaded.op.stateHash, revision: loaded.op.revision }
        : undefined,
      skinControl: { personIndex: 0, available },
      viewKey: "skin-native-person0",
      outlineWidth: width,
      notice: "",
      failed: false,
      onFrame: () => setReady(true),
    }),
    [loaded, key, skin, width],
  );
  const content = (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-3 p-3">
      <p className="text-xs text-text-secondary" role="status">
        {notice}
      </p>
      <button
        className="self-start rounded border px-2 py-1 text-xs"
        onClick={() => navigate(bar ? "/app/review" : "/bar/review")}
      >
        {bar ? "앱 화면" : "플로팅 바"}
      </button>
      <div
        className="mx-auto w-full overflow-hidden rounded-lg border border-border bg-surface-2"
        style={{ height: bar ? 270 : 450 }}
      >
        <InteractiveReview data={data} />
      </div>
      <SkinControl personIndex={0} available={available} />
      <OutlineControl personIndex={0} />
      <button
        className="rounded border p-2 text-sm disabled:opacity-50"
        disabled={!ready || !loaded}
        onClick={async () => {
          try {
            const op = loaded!.op;
            if (!sameSkin(op.skin, selectedSkin(skin)) || (op.appearance?.width ?? 0) !== width)
              throw Error("현재 선택과 일치하는 기록 파일 없음 · native 쓰기 0회");
            const response = await fetch(`/qa/${key}/file`);
            if (!response.ok) throw Error("기록 파일 없음");
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength !== op.exportReceipt!.artifactBytes) throw Error("파일 크기 변경");
            await verifyBytes(bytes, op.exportReceipt!.artifactSha256);
            const files = await exportTauri.saveCandidates({
              folder: import.meta.env.VITE_SKIN_QA_OUTPUT,
              files: [
                {
                  fileName: `native-skin-${skin}-outline${width}.fbx`,
                  content: new Uint8Array(bytes),
                },
              ],
            });
            setNotice(`native 저장 완료: ${files[0].path}`);
          } catch (e) {
            setNotice(e instanceof Error ? e.message : "native 저장 실패");
          }
        }}
      >
        검증한 기록 파일 저장
      </button>
    </div>
  );
  return (
    <>
      <WindowModeSync />
      {bar ? (
        <BarShell title="스킨·FBX 로컬 검사">{content}</BarShell>
      ) : (
        <AppShell title="스킨·FBX 로컬 검사">{content}</AppShell>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
