// Local UI/native harness. No BFF, solver, inference or certification is simulated.
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { AppShell } from "../../src/shared/components/AppShell";
import { BarShell } from "../../src/features/bar/components/BarShell";
import { WindowModeSync } from "../../src/features/bar/components/WindowModeSync";
import { InteractivePose } from "../../src/features/pose-viewer/interactive/InteractivePose";
import { OutlineControl } from "../../src/features/pose-viewer/outline/OutlineControl";
import { usePoseSelectionStore } from "../../src/features/pose-viewer/store/poseSelectionStore";
import { exportTauri } from "../../src/features/export/api/export.tauri";
import { cameraSchema } from "../../src/features/pose-viewer/interactive/contract";
import "../../src/app/styles/index.css";
const qc = new QueryClient();
usePoseSelectionStore.getState().startJob("outline-native-qa", null);
export default function App() {
  const navigate = useNavigate();
  const bar = useLocation().pathname.startsWith("/bar");
  const [person, setPerson] = useState(0);
  const [asset, setAsset] = useState<{ body: THREE.Group; bytes: Uint8Array }>();
  const [notice, setNotice] = useState("로컬 원본 불러오는 중");
  const width = usePoseSelectionStore((s) => s.outlineByPerson[person] ?? 0);
  useEffect(() => {
    let cancelled = false;
    setAsset(undefined);
    void fetch(`/${person === 0 ? "male" : person === 1 ? "female" : "live"}.fbx`)
      .then((r) => r.arrayBuffer())
      .then((data) => {
        const original = new FBXLoader().parse(data, "");
        original.updateMatrixWorld(true);
        const body = new THREE.Group();
        original.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const geometry = o.geometry.clone();
          const position = geometry.getAttribute("position");
          const v = new THREE.Vector3();
          for (let i = 0; i < position.count; i++) {
            o.getVertexPosition(i, v);
            v.applyMatrix4(o.matrixWorld);
            position.setXYZ(i, v.x, v.y, v.z);
          }
          geometry.computeVertexNormals();
          body.add(new THREE.Mesh(geometry, new THREE.MeshNormalMaterial()));
        });
        body.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(body);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const factor = 1.75 / size.y;
        body.scale.multiplyScalar(factor);
        body.position.sub(center.multiplyScalar(factor));
        body.traverse((o) => {
          if (o instanceof THREE.Mesh) o.material = new THREE.MeshNormalMaterial();
        });
        if (!cancelled) {
          setAsset({ body, bytes: new Uint8Array(data) });
          setNotice(
            person === 2
              ? "기록한 실제 BFF/Converter 0 결과 · 현재 UI와 실시간 연결 아님"
              : "로컬 UI/native 검사 · 실제 BFF 연결 아님",
          );
        }
      })
      .catch(() => setNotice("로컬 FBX를 불러오지 못했어요"));
    return () => {
      cancelled = true;
    };
  }, [person]);
  const camera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.01, 20);
    c.position.set(0, 0, 4);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    return cameraSchema.parse({
      schemaVersion: "interactive-camera-v1",
      projection: "orthographic",
      viewMatrix: c.matrixWorldInverse.toArray(),
      projectionMatrix: c.projectionMatrix.toArray(),
      matrixLayout: "column-major",
      basis: "right-handed-Y-up",
      clipSpace: "webgl-minus-one-to-one",
      origin: "hips",
      units: "meters",
      distanceTorso: null,
      torsoReferenceSha256: "a".repeat(64),
      target: [0, 0, 0],
      referenceAspect: 1,
      framing: "projection-includes-center-scale-crop",
      baked: "none",
    });
  }, []);
  const surface = useMemo(
    () => (asset ? { body: asset.body, camera } : undefined),
    [asset, camera],
  );
  const content = (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-xs">{notice}</p>
      <p className="text-xs">
        화면 외곽선 전용 검수. 현재 FBX 표현은 CSP에서 실패하여 비0 저장이 차단됩니다.
      </p>
      <div className="flex gap-2 text-xs">
        <button onClick={() => setPerson(0)}>남성 인물 1</button>
        <button onClick={() => setPerson(1)}>여성 인물 2</button>
        <button onClick={() => setPerson(2)}>실제 변환 0 결과</button>
        <button
          onClick={() => navigate(bar ? "/app/jobs/outline-native-qa/review" : "/bar/review")}
        >
          {bar ? "앱 화면" : "플로팅 바"}
        </button>
      </div>
      <div style={{ height: bar ? 250 : 400 }}>
        <InteractivePose surface={surface} viewKey={`native-${person}`} outlineWidth={width} />
      </div>
      <OutlineControl personIndex={person} />
      <button
        className="rounded border p-2 text-sm"
        onClick={async () => {
          if (width > 0) {
            setNotice("비0 저장 차단 · CSP에서 검증된 외곽선 표현 없음 · native 쓰기 0회");
            return;
          }
          if (!asset) return;
          try {
            const files = await exportTauri.saveCandidates({
              folder: import.meta.env.VITE_OUTLINE_QA_OUTPUT,
              files: [{ fileName: `native-zero-${person}.fbx`, content: asset.bytes }],
            });
            setNotice(`0 원본 native 저장: ${files[0].path}`);
          } catch {
            setNotice("native 저장 실패");
          }
        }}
      >
        검사 파일 저장
      </button>
    </div>
  );
  return (
    <>
      <WindowModeSync />
      {bar ? (
        <BarShell title="외곽선 native 검사">{content}</BarShell>
      ) : (
        <AppShell title="외곽선 native 검사">{content}</AppShell>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
