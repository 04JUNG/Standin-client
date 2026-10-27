import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
/** Render the verified FBX bytes independently of download readiness. No external texture fetches. */
export function LocalFbxPreview({
  content,
  name,
  format = "fbx",
}: {
  content?: Uint8Array;
  name: string;
  format?: "fbx" | "glb";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [surface, setSurface] = useState<{ content: Uint8Array; status: "ready" | "failed" }>();
  const status = surface?.content === content ? surface?.status : "loading";
  useEffect(() => {
    if (!content || !canvas.current) return;
    const element = canvas.current;
    let renderer: THREE.WebGLRenderer | undefined;
    let model: THREE.Object3D | undefined;
    let parser: Worker | undefined;
    let parserTimeout: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    const setup = async () => {
      try {
        if (format === "glb") {
          const loader = new GLTFLoader();
          loader.manager.setURLModifier(() => {
            throw new Error("external resource");
          });
          model = (await loader.parseAsync(content.slice().buffer, "")).scene;
        } else {
          const object = await new Promise<THREE.Object3DJSON>((resolve, reject) => {
            parser = new Worker(new URL("./fbxPreview.worker.ts", import.meta.url), {
              type: "module",
            });
            parserTimeout = setTimeout(() => {
              parser?.terminate();
              reject(new Error("preview timeout"));
            }, 15_000);
            parser.onmessage = (
              event: MessageEvent<{ ok: boolean; object?: THREE.Object3DJSON }>,
            ) => {
              clearTimeout(parserTimeout);
              parser?.terminate();
              if (event.data.ok && event.data.object) resolve(event.data.object);
              else reject(new Error("preview failed"));
            };
            parser.onerror = () => {
              clearTimeout(parserTimeout);
              parser?.terminate();
              reject(new Error("preview failed"));
            };
            const buffer = content.slice().buffer;
            parser.postMessage(buffer, [buffer]);
          });
          if (disposed) return;
          const loader = new THREE.ObjectLoader();
          loader.manager.setURLModifier(() => {
            throw new Error("external resource");
          });
          model = loader.parse(object);
        }
        if (disposed) {
          model.traverse((node) => {
            if (node instanceof THREE.Mesh) node.geometry.dispose();
          });
          return;
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f3f5);
        scene.add(model, new THREE.HemisphereLight(0xffffff, 0x777788, 3));
        const light = new THREE.DirectionalLight(0xffffff, 2);
        light.position.set(3, 5, 4);
        scene.add(light);
        model.updateMatrixWorld(true);
        model.traverse((node) => {
          if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
        });
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 0.01);
        const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
        camera.position.copy(center).add(new THREE.Vector3(0, radius * 0.1, radius * 2.3));
        camera.lookAt(center);
        renderer = new THREE.WebGLRenderer({ canvas: element, antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        const draw = () => {
          if (!canvas.current || !renderer) return;
          const width = canvas.current.clientWidth || 256;
          renderer.setSize(width, width, false);
          camera.aspect = 1;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        };
        draw();
        observer = new ResizeObserver(draw);
        observer.observe(element);
        setSurface({ content, status: "ready" });
      } catch {
        if (!disposed) setSurface({ content, status: "failed" });
      }
    };
    void setup();
    return () => {
      disposed = true;
      clearTimeout(parserTimeout);
      parser?.terminate();
      observer?.disconnect();
      model?.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material])
            material.dispose();
        }
      });
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, [content, format]);
  return (
    <div className="relative aspect-square w-full rounded border border-border bg-surface-2">
      <canvas ref={canvas} className="h-full w-full" aria-label={`${name}에 적용한 포즈`} />
      {(!content || status !== "ready") && (
        <p
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-surface-2 p-3 text-center text-xs"
        >
          {status === "failed"
            ? "미리보기를 표시하지 못했어요. 준비된 FBX는 저장할 수 있어요."
            : "내 체형의 포즈를 준비하고 있어요."}
        </p>
      )}
    </div>
  );
}
