import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { humanTemplateDigest, loadHumanTemplate, loadReferenceBvh } from "../api/humanReference";
import { referencePose } from "../preview/humanReference/pose";
import { referenceMesh } from "../preview/humanReference/referenceMesh";
import { loadFingerSkin, sourceFingerPose } from "../preview/humanReference/sourceFingers";
import { PREVIEW_BACKGROUND } from "../preview/previewStyle";

export default function CandidateSourcePreview({
  url,
  source,
  scope,
}: {
  url: string;
  source?: string;
  scope: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const controller = new AbortController();
    const { signal } = controller;
    let release: (() => void) | undefined;
    const deadline = setTimeout(() => {
      controller.abort();
      setState("error");
    }, 10_000);
    void Promise.all([
      loadHumanTemplate(scope, signal),
      loadReferenceBvh(url, source, scope, signal, url.startsWith("/v1/analysis/jobs/")),
    ])
      .then(async ([template, text]) => {
        const skin = await loadFingerSkin(scope, humanTemplateDigest(template));
        signal.throwIfAborted();
        const base = referencePose(template, text);
        const fingers = skin && sourceFingerPose(template, text, base, skin);
        const model = fingers
          ? referenceMesh(fingers.template, fingers.matrices, fingers.wrists)
          : referenceMesh(template, base.matrices);
        release = model.release;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        release = () => {
          model.release();
          renderer.dispose();
          renderer.domElement.remove();
        };
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(PREVIEW_BACKGROUND);
        scene.add(model.body);
        const extent = model.bounds.getSize(new THREE.Vector3());
        const center = model.bounds.getCenter(new THREE.Vector3());
        const half = Math.max(extent.x, extent.y, extent.z) * 0.65;
        const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, 100);
        camera.position.copy(center).add(new THREE.Vector3(0, 0, 10));
        target.append(renderer.domElement);
        renderer.domElement.setAttribute("aria-label", "회전할 수 있는 3D 포즈");
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(center);
        controls.enablePan = false;
        controls.minZoom = 0.75;
        controls.maxZoom = 4;
        controls.update();
        const draw = () => renderer.render(scene, camera);
        controls.addEventListener("change", draw);
        const resize = () => {
          const aspect = Math.max(1, target.clientWidth / target.clientHeight);
          camera.left = -half * aspect;
          camera.right = half * aspect;
          camera.updateProjectionMatrix();
          renderer.setSize(target.clientWidth, target.clientHeight);
          draw();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(target);
        const dispose = release;
        release = () => {
          observer.disconnect();
          controls.dispose();
          dispose();
        };
        resize();
        setState("ready");
      })
      .catch(() => {
        release?.();
        release = undefined;
        if (!signal.aborted) setState("error");
      })
      .finally(() => clearTimeout(deadline));
    return () => {
      controller.abort();
      clearTimeout(deadline);
      release?.();
    };
  }, [url, source, scope]);
  return (
    <div className="relative h-72 overflow-hidden rounded-lg bg-surface-2" ref={container}>
      {state !== "ready" && (
        <p
          className="absolute inset-0 grid place-items-center text-sm text-text-secondary"
          role="status"
        >
          {state === "loading" ? "3D 포즈를 불러오는 중…" : "3D 미리보기를 표시할 수 없어요."}
        </p>
      )}
    </div>
  );
}
