import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { Loader2, PersonStanding } from "lucide-react";
import { apiFetchText } from "@/shared/api/client";

/**
 * 저장 대상 BVH의 첫 프레임을 3D 스켈레톤으로 보여준다(FE-04).
 *
 * 왜 필요한가: refine이 적용되면 작가가 후보 카드에서 고른 포즈와 실제로 저장되는 포즈가
 * 달라진다. 정적 thumbnail만 있으면 그 차이를 저장 전에 확인할 방법이 없다.
 *
 * BFF가 확정한 export URL을 그대로 읽는다 — 미리보기와 저장이 **같은 URL**을 봐야
 * "본 것과 저장된 것이 다르다"가 구조적으로 불가능해진다.
 *
 * r3f를 도입하지 않은 이유: 확정본 1개를 정적으로 보여줄 뿐이라 씬 그래프를 React가
 * 소유할 이유가 없다. 후보 갤러리를 3D로 만들 때 다시 판단한다(CLAUDE.md §4).
 */

/**
 * 첫 프레임 자세만 본다. 저장되는 것은 포즈이지 동작이 아니다.
 *
 * ⚠ BVHLoader가 만든 Bone은 HIERARCHY의 OFFSET만 반영한 rest pose다. 실제 자세는 clip의
 *   키프레임에 있으므로 mixer로 t=0을 샘플링해야 한다. 이 단계를 빼면 어떤 포즈를 골라도
 *   똑같은 T자 뼈대가 보인다.
 */
const REST_FRAME = 0;

type BvhPreviewProps = {
  /** BFF의 안정적인 export 경로. 추론 서버의 /refined/{handle}를 직접 넣지 않는다. */
  url: string;
  label: string;
};

export function BvhPreview({ url, label }: BvhPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;

    async function render() {
      let bvhText: string;
      try {
        bvhText = await apiFetchText(url, { auth: false });
      } catch {
        // 미리보기 실패가 저장을 막지는 않는다. 화면에만 대체 안내를 띄운다.
        if (!disposed) setStatus("failed");
        return;
      }
      if (disposed || !mount) return;

      let root: THREE.Bone;
      let bones: THREE.Bone[];
      try {
        const parsed = new BVHLoader().parse(bvhText);
        bones = parsed.skeleton.bones;
        root = bones[0]!;
        // rest pose가 아니라 실제 자세를 세운다.
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(parsed.clip).play();
        mixer.setTime(REST_FRAME);
      } catch {
        if (!disposed) setStatus("failed");
        return;
      }

      const scene = new THREE.Scene();
      const helper = new THREE.SkeletonHelper(root);
      scene.add(root, helper);
      root.updateMatrixWorld(true);

      // 뼈대 크기가 라이브러리마다 다르다. 바운딩 박스로 카메라 거리를 맞춰
      // 어떤 포즈든 프레임 안에 들어오게 한다.
      const box = new THREE.Box3().setFromPoints(
        bones.map((bone) => bone.getWorldPosition(new THREE.Vector3())),
      );
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);

      const width = mount.clientWidth || 320;
      const height = mount.clientHeight || 240;
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, radius * 100);
      camera.position.set(center.x, center.y, center.z + radius * 2.8);
      camera.lookAt(center);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);

      // 정지 이미지가 아니라 천천히 도는 편이 3D 자세를 훨씬 잘 읽힌다.
      const pivot = center.clone();
      let angle = 0;
      const tick = () => {
        if (disposed || !renderer) return;
        angle += 0.005;
        camera.position.set(
          pivot.x + Math.sin(angle) * radius * 2.8,
          pivot.y,
          pivot.z + Math.cos(angle) * radius * 2.8,
        );
        camera.lookAt(pivot);
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      setStatus("ready");
      tick();
    }

    void render();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (renderer) {
        renderer.domElement.remove();
        renderer.dispose();
      }
    };
  }, [url]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-brand-paper">
      <div ref={mountRef} className="h-full w-full" aria-label={`${label} 3D 미리보기`} />
      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12px] text-text-secondary">
          {status === "loading" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span>포즈를 불러오는 중…</span>
            </>
          ) : (
            <>
              <PersonStanding className="h-6 w-6" aria-hidden />
              <span>미리보기를 표시하지 못했습니다. 저장은 계속할 수 있습니다.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
