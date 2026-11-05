/* eslint-disable react-refresh/only-export-components -- private local QA harness */
import { useMemo, useRef, useState } from "react";
import {
  InteractivePose,
  type SurfaceView,
} from "@/features/pose-viewer/interactive/InteractivePose";
import {
  loadSolvedPacket,
  prepareSurface,
  solvedCamera,
  prepareHandVariants,
  localHandSurface,
} from "@/features/pose-viewer/interactive/solved";
import { receiptSchema } from "@/features/pose-viewer/interactive/http";
const states = [];
const caseManifest = await (await fetch("/samples/.local-real/case-manifest.private.json")).json();
for (let i = 0; i < 3; i++) {
  const packet = await (await fetch(`/samples/.local-real/case-${i}.packet.private.json`)).json();
  const loaded = await loadSolvedPacket(packet, {
    operationId: packet.operation,
    revision: packet.revision,
    stateHash: packet.stateHash,
    personIndex: 0,
    candidateId: caseManifest[i].candidateId,
  });
  const receipt = receiptSchema.parse(
    await (await fetch(`/samples/.local-real/case-${i}.receipt.private.json`)).json(),
  );
  if (receipt.stateHash !== packet.stateHash || receipt.revision !== packet.revision)
    throw Error("file/display state mismatch");
  states.push({ ...loaded, receipt, surface: prepareSurface(loaded.state.model) });
}
const frame = {
  target: [0, 0, 0] as [number, number, number],
  referenceAspect: 1,
  projectionIncludesCenterScaleCrop: true as const,
};
const atlasBytes = new Uint8Array(
  await (await fetch("/samples/.local-real/hands-atlas.private.json")).arrayBuffer(),
);
const atlas = await prepareHandVariants(
  atlasBytes,
  (await (await fetch("/samples/.local-real/hands-atlas.sha256")).text()).trim(),
);
for (let i = 0; i < 2; i++) {
  const surface = localHandSurface(
    atlas,
    states[i].state.identity,
    states[i].state.identity.hands.left,
    states[i].state.identity.hands.right,
  );
  if (!surface) throw Error("verified hand variant missing");
  states[i].surface.release();
  states[i].surface = surface;
}
const labels = ["원본 · 편안한 손", "원본 · 왼손 주먹", "리파인 + 왼손 주먹"];
const percentile = (samples: number[], p: number) =>
  samples.toSorted((a, b) => a - b)[Math.ceil(samples.length * p) - 1];
export default function RealComparison() {
  const [selected, setSelected] = useState(1),
    [report, setReport] = useState(""),
    [running, setRunning] = useState(false);
  const pending = useRef<(() => void) | undefined>();
  const surface: SurfaceView = useMemo(
    () => ({
      body: states[selected].surface.body,
      camera: solvedCamera(states[selected].state, frame),
      onFirstFrame: () => {
        // QA-only measurement: wait for the existing shared WebGL2 context's
        // submitted work. Normal product rendering never calls gl.finish().
        if (pending.current) {
          const canvas = document.querySelector<HTMLCanvasElement>(
            'canvas[data-replay-private="true"][aria-hidden="true"]',
          );
          const gl = canvas?.getContext("webgl2");
          if (!gl || gl.isContextLost()) throw Error("GPU completion unavailable");
          gl.finish();
        }
        pending.current?.();
        pending.current = undefined;
      },
    }),
    [selected],
  );
  const base: SurfaceView = useMemo(
    () => ({ body: states[0].surface.body, camera: solvedCamera(states[0].state, frame) }),
    [],
  );
  const measure = async () => {
    setRunning(true);
    const samples = [];
    try {
      for (let i = 0; i < 46; i++) {
        const next = i % 2,
          start = performance.now();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(Error("first changed frame timed out")), 3000);
          pending.current = () => {
            clearTimeout(timer);
            resolve();
          };
          setSelected(next);
        });
        if (i >= 6) samples.push(performance.now() - start);
      }
      const value = {
        metric: "cached-hand-input-to-GPU-complete",
        samples: samples.length,
        p50: percentile(samples, 0.5),
        p95: percentile(samples, 0.95),
        max: Math.max(...samples),
        limitMs: 100,
        pass: percentile(samples, 0.95) <= 100,
        networkIncluded: false,
        serverIncluded: false,
        gpuCompletionIncluded: true,
        displayPresentationIncluded: false,
      };
      setReport(JSON.stringify(value, null, 2));
    } catch (e) {
      setReport(String(e));
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="h-full overflow-auto p-6">
      <p className="mb-4 text-sm">
        실제 승인 Master v2 · 같은 상태 해시의 FBX를 별도 Blender 프로세스로 재가져와 검증
      </p>
      <div className="mb-4 flex gap-3">
        {labels.map((label, i) => (
          <button
            className="rounded border px-3 py-2 text-sm"
            disabled={running}
            key={label}
            onClick={() => setSelected(i)}
          >
            {label}
          </button>
        ))}
        <button
          className="rounded border px-3 py-2 text-sm"
          disabled={running}
          onClick={() => void measure()}
        >
          캐시된 손 40회 측정
        </button>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div>
          <p className="mb-2 text-sm">원본 비교 기준</p>
          <div style={{ height: 420 }} className="rounded border bg-surface-0">
            <InteractivePose surface={base} viewKey="real-before" showControls={false} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm">{labels[selected]}</p>
          <div style={{ height: 420 }} className="rounded border bg-surface-0">
            <InteractivePose surface={surface} viewKey="real-after" showControls={false} />
          </div>
        </div>
      </div>
      <div className="mt-4 text-xs">
        <p>
          화면·FBX 상태: <code>{states[selected].packet.stateHash}</code>
        </p>
        <p>
          관절·정점·스킨·법선 최대 오차:{" "}
          {Math.max(
            states[selected].receipt.correspondence.maxPositionErrorM,
            states[selected].receipt.correspondence.maxMatrixError,
            states[selected].receipt.correspondence.maxWeightError,
            states[selected].receipt.correspondence.maxNormalError,
          )}
        </p>
        <p>리파인: {states[selected].state.identity.source.refineVersion}</p>
      </div>
      {report && (
        <pre data-real-performance className="mt-4 rounded border bg-surface-0 p-4 text-xs">
          {report}
        </pre>
      )}
    </div>
  );
}
