import * as THREE from "three";
import {
  loadApprovedModel,
  type PreviewGender,
} from "../../src/features/pose-viewer/preview/humanReference/approvedModels";
import { referenceSurface } from "../../src/features/pose-viewer/preview/humanReference/surface";
import type { HumanScope } from "../../src/features/pose-viewer/preview/humanReference/template";

async function run() {
  // Vite serves .gz with HTTP Content-Encoding; .bin aliases keep the exact
  // packed bytes so this QA page exercises the production integrity checks.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(input);
    return nativeFetch(
      url.includes("/approvedAssets/") && url.includes(".json.gz")
        ? `/tools/preview-crop-review/${url.includes("female") ? "female" : "male"}.bin`
        : input,
      init,
    );
  };
  const output = document.createElement("canvas");
  output.width = 1200;
  output.height = 1140;
  const ctx = output.getContext("2d")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(600, 340, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cases: { gender: PreviewGender; scope: HumanScope; pose: string; label: string }[] = [
    { gender: "male", scope: "full", pose: "normal", label: "남성 · 어깨 / 정면" },
    { gender: "male", scope: "half", pose: "asymmetric", label: "남성 · 반신 / 아래쪽 시점" },
    { gender: "female", scope: "half", pose: "raised", label: "여성 · 반신 / 아래쪽 시점" },
  ];
  for (const [row, item] of cases.entries()) {
    const signal = new AbortController().signal;
    const full = await loadApprovedModel(item.gender, "full", signal);
    const fixed = await loadApprovedModel(item.gender, item.scope, signal);
    const bvh = await (await fetch(`/src/test/fixtures/approved-preview/${item.pose}.bvh`)).text();
    const cut = full.template.joints.find((j) => j.role === "hips")!.head[1] - 0.06;
    const oldTemplate =
      item.scope === "full"
        ? full.template
        : {
            ...full.template,
            scope: item.scope,
            meshes: full.template.meshes.map((m) => ({
              ...m,
              triangles: m.triangles.filter((_, i, a) => {
                const start = i - (i % 3);
                return [a[start], a[start + 1], a[start + 2]].every(
                  (v) => m.positions[v * 3 + 1] >= cut,
                );
              }),
            })),
          };
    const before = referenceSurface(oldTemplate, bvh, full.skin);
    const after = referenceSurface(fixed.template, bvh, fixed.skin, fixed.corrections);
    const bounds = before.bounds.clone().union(after.bounds);
    const target = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const h = Math.max(size.y, size.x / (600 / 340), 0.01) * 0.58;
    const camera = new THREE.OrthographicCamera(
      (-h * 600) / 340,
      (h * 600) / 340,
      h,
      -h,
      0.01,
      100,
    );
    camera.position.copy(target).add(new THREE.Vector3(0, item.scope === "half" ? -5 : 0, 10));
    camera.lookAt(target);
    for (const [col, surface] of [before, after].entries()) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#999999");
      scene.add(surface.body);
      renderer.render(scene, camera);
      ctx.fillStyle = "#f0f3f7";
      ctx.fillRect(col * 600, row * 380, 600, 40);
      ctx.fillStyle = "#202c3b";
      ctx.font = "18px system-ui";
      ctx.fillText(
        `${col ? "수정 코드" : "이전 경로"} · ${item.label}`,
        col * 600 + 16,
        row * 380 + 27,
      );
      ctx.drawImage(renderer.domElement, col * 600, row * 380 + 40);
      surface.release();
    }
  }
  renderer.dispose();
  document.querySelector("#output")!.append(output);
  const link = document.createElement("a");
  link.href = output.toDataURL("image/png");
  link.download = "preview-crop-shoulder-review.png";
  link.textContent = "비교 이미지 저장";
  document.querySelector("#output")!.append(link);
  document.querySelector("#status")!.textContent =
    "6/6 렌더링 완료 · 왼쪽: 이전 경로 / 오른쪽: 수정 코드";
}
void run().catch((error) => {
  document.querySelector("#status")!.textContent = String(error);
});
