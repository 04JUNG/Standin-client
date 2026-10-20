import * as THREE from "three";
import { libraryPreviewMaterial, PREVIEW_BACKGROUND } from "../previewStyle";
import type { HumanTemplate } from "./template";
import { referencePose, referenceBounds } from "./pose";
let renderer: THREE.WebGLRenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
const cache = new WeakMap<HumanTemplate, { scene: THREE.Scene; material: THREE.ShaderMaterial }>();
function sceneFor(template: HumanTemplate) {
  const cached = cache.get(template);
  if (cached) return cached;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BACKGROUND);
  const material = libraryPreviewMaterial();
  material.uniforms.referenceBones = { value: template.joints.map(() => new THREE.Matrix4()) };
  material.vertexShader = `
    uniform mat4 referenceBones[${template.joints.length}];
    attribute vec4 skinIndexA,skinIndexB,skinWeightA,skinWeightB;
    varying vec3 previewNormal;
    void main(){
      mat4 skin=skinWeightA.x*referenceBones[int(skinIndexA.x)]+skinWeightA.y*referenceBones[int(skinIndexA.y)]+skinWeightA.z*referenceBones[int(skinIndexA.z)]+skinWeightA.w*referenceBones[int(skinIndexA.w)]
        +skinWeightB.x*referenceBones[int(skinIndexB.x)]+skinWeightB.y*referenceBones[int(skinIndexB.y)]+skinWeightB.z*referenceBones[int(skinIndexB.z)]+skinWeightB.w*referenceBones[int(skinIndexB.w)];
      previewNormal=normalize(normalMatrix*mat3(skin)*normal);
      gl_Position=projectionMatrix*modelViewMatrix*skin*vec4(position,1.0);
    }`;
  for (const data of template.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setIndex(data.triangles);
    for (const [name, array] of [
      ["skinIndex", data.skinIndices],
      ["skinWeight", data.skinWeights],
    ] as const) {
      const a: number[] = [],
        b: number[] = [];
      for (let i = 0; i < array.length; i += 8) {
        a.push(...array.slice(i, i + 4));
        b.push(...array.slice(i + 4, i + 8));
      }
      geometry.setAttribute(name + "A", new THREE.Float32BufferAttribute(a, 4));
      geometry.setAttribute(name + "B", new THREE.Float32BufferAttribute(b, 4));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const value = { scene, material };
  cache.set(template, value);
  return value;
}
/** Canonical front, actual human mesh, approximate reference retarget; no Converter. */
export function renderHumanReference(
  template: HumanTemplate,
  text: string,
  signal: AbortSignal,
  size = 384,
): Promise<string> {
  const work = () => {
    signal.throwIfAborted();
    const { matrices } = referencePose(template, text),
      bounds = referenceBounds(template, matrices);
    const center = bounds.getCenter(new THREE.Vector3()),
      extent = bounds.getSize(new THREE.Vector3());
    const half = Math.max(extent.x, extent.y, 0.01) * 0.57;
    const camera = new THREE.OrthographicCamera(
      center.x - half,
      center.x + half,
      center.y + half,
      center.y - half,
      0.001,
      100,
    );
    camera.position.z = center.z + 10;
    camera.updateMatrixWorld();
    const { scene, material } = sceneFor(template);
    material.uniforms.referenceBones.value = matrices;
    if (!renderer || renderer.getContext().isContextLost())
      renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.render(scene, camera);
    const image = renderer.domElement.toDataURL("image/png");
    signal.throwIfAborted();
    return image;
  };
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}
