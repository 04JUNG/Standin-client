import * as THREE from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import type { RenderCamera } from "../api/posePresentation";

const key = (s: string) =>
  s
    .split(":")
    .pop()!
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
export function bvhGeometry(text: string, scope: string | null, c: RenderCamera, turn = 0) {
  if (
    !text.startsWith("HIERARCHY") ||
    text.length > 2_000_000 ||
    (text.match(/\bJOINT\b/g)?.length ?? 0) > 500 ||
    !["full", "half", "bust", "shoulder_head", "head"].includes(scope ?? "")
  )
    throw Error("지원하지 않는 BVH 또는 출력 범위입니다.");
  const frames = Number(text.match(/Frames:\s*(\d+)/)?.[1]);
  if (!frames || frames > 10000) throw Error("BVH 프레임을 확인하지 못했습니다.");
  if (
    c.version !== "pose-preview-camera-v1" ||
    c.bvh_camera_rotation_applied !== false ||
    c.origin !== "hip_midpoint" ||
    c.scale !== "hip_to_shoulder_midpoint_length"
  )
    throw Error("미리보기 카메라 규약을 확인하지 못했습니다.");
  const result = new BVHLoader().parse(text);
  const root = result.skeleton.bones[0];
  // Preview frame zero directly. AnimationMixer treats ':' in Mixamo bone names
  // as binding syntax and silently leaves those bones in their offset pose.
  const byName = new Map(result.skeleton.bones.map((bone) => [bone.name, bone]));
  for (const track of result.clip.tracks) {
    const separator = track.name.lastIndexOf(".");
    const bone = byName.get(track.name.slice(0, separator));
    const property = track.name.slice(separator + 1);
    if (!bone || !track.times.length) throw Error("BVH 프레임 관절을 확인하지 못했습니다.");
    if (property === "position") bone.position.fromArray(track.values, 0);
    else if (property === "quaternion") bone.quaternion.fromArray(track.values, 0);
    else throw Error("지원하지 않는 BVH 프레임입니다.");
  }
  root.updateMatrixWorld(true);
  const bones = result.skeleton.bones;
  const find = (...names: string[]) =>
    bones.find((b) => names.includes(key(b.name)))?.getWorldPosition(new THREE.Vector3());
  const lh = find("leftupleg", "lefthip"),
    rh = find("rightupleg", "righthip"),
    ls = find("leftarm", "leftshoulder"),
    rs = find("rightarm", "rightshoulder");
  if (!lh || !rh || !ls || !rs) throw Error("몸통 정규화 관절을 확인하지 못했습니다.");
  const hip = lh.add(rh).multiplyScalar(0.5),
    shoulder = ls.add(rs).multiplyScalar(0.5),
    length = hip.distanceTo(shoulder);
  if (!Number.isFinite(length) || length < 1e-6) throw Error("몸통 길이를 확인하지 못했습니다.");
  const m = c.rotation;
  if (
    !Array.isArray(m) ||
    m.length !== 3 ||
    m.some((r) => r.length !== 3 || r.some((x) => !Number.isFinite(x)))
  )
    throw Error("카메라 회전값이 유효하지 않습니다.");
  const rotation = new THREE.Matrix4().set(
    m[0][0],
    m[0][1],
    m[0][2],
    0,
    m[1][0],
    m[1][1],
    m[1][2],
    0,
    m[2][0],
    m[2][1],
    m[2][2],
    0,
    0,
    0,
    0,
    1,
  );
  const extra = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(turn));
  const visible = (name: string) =>
    scope === "full" ||
    (scope === "half" && !/upleg|hip$|leg|foot|toe/.test(name)) ||
    ((scope === "shoulder_head" || scope === "bust") &&
      /spine2|neck|head|shoulder|^(left|right)arm$/.test(name)) ||
    (scope === "head" && /neck|head/.test(name));
  const points = new Map<THREE.Bone, THREE.Vector3>();
  for (const b of bones) {
    // End sites inherit their branch; a cropped leg must not leave floating foot dots.
    let excludedBranch = false;
    if (scope === "half")
      for (let ancestor: THREE.Object3D | null = b; ancestor; ancestor = ancestor.parent) {
        if (/upleg|hip$|leg|foot|toe/.test(key(ancestor.name))) excludedBranch = true;
      }
    const name = key(b.name);
    const inScope = name === "endsite" ? visible(key(b.parent?.name ?? "")) : visible(name);
    if (excludedBranch || !inScope) continue;
    const p = b
      .getWorldPosition(new THREE.Vector3())
      .sub(hip)
      .divideScalar(length)
      .applyMatrix4(rotation)
      .applyMatrix4(extra);
    if (![p.x, p.y, p.z].every(Number.isFinite)) throw Error("BVH 관절값이 유효하지 않습니다.");
    points.set(b, p);
  }
  const links: [THREE.Vector3, THREE.Vector3][] = [];
  for (const [b, p] of points) {
    const parent = points.get(b.parent as THREE.Bone);
    if (parent && p.distanceTo(parent) > 1e-6) links.push([parent, p]);
  }
  if (!links.length) throw Error("표시할 관절이 없습니다.");
  return { points: [...points.values()], links };
}

/** Exact contract projection before display framing. Exported for numeric camera tests. */
export function projectPoint(p: THREE.Vector3, c: RenderCamera): [number, number] {
  if (c.projection === "orthographic") return [p.x, -p.y];
  const depth = p.z + (c.distance_torso ?? 0);
  if (c.projection !== "perspective" || depth <= 0.1)
    throw Error("카메라 뒤의 관절은 표시할 수 없습니다.");
  return [p.x / depth, -p.y / depth];
}
let renderer: THREE.WebGLRenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
export function renderBvh(
  text: string,
  scope: string | null,
  c: RenderCamera,
  turn = 0,
  size = 384,
): Promise<string> {
  const work = () => {
    const { points, links } = bvhGeometry(text, scope, c, turn),
      projected = points.map((p) => projectPoint(p, c));
    const box = new THREE.Box2().setFromPoints(
      projected.map((p) => new THREE.Vector2(p[0], -p[1])),
    );
    const center = box.getCenter(new THREE.Vector2()),
      extent = box.getSize(new THREE.Vector2());
    const half = Math.max(extent.x, extent.y, 0.2) * 0.65;
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (c.projection === "perspective") {
      const d = c.distance_torso!;
      camera = new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(2 * Math.atan(half)),
        1,
        0.01,
        1000,
      );
      camera.position.z = d;
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = center.x / half;
      camera.projectionMatrix.elements[9] = center.y / half;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    } else {
      camera = new THREE.OrthographicCamera(
        center.x - half,
        center.x + half,
        center.y + half,
        center.y - half,
        0.01,
        1000,
      );
      camera.position.z = 100;
      camera.updateMatrixWorld();
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f5f8");
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(2, 4, 8);
    scene.add(light);
    const material = new THREE.MeshStandardMaterial({ color: 0x427bc4, roughness: 0.7 });
    const geometries: THREE.BufferGeometry[] = [];
    const reflected = (p: THREE.Vector3) => new THREE.Vector3(p.x, p.y, -p.z);
    for (const [a, b] of links) {
      const start = reflected(a),
        end = reflected(b),
        delta = end.clone().sub(start),
        len = delta.length();
      const g = new THREE.CylinderGeometry(0.025, 0.025, len, 8);
      geometries.push(g);
      const mesh = new THREE.Mesh(g, material);
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      scene.add(mesh);
    }
    const sphere = new THREE.SphereGeometry(0.04, 8, 6);
    geometries.push(sphere);
    for (const p of points) {
      const joint = new THREE.Mesh(sphere, material);
      joint.position.copy(reflected(p));
      scene.add(joint);
    }
    try {
      if (!renderer || renderer.getContext().isContextLost())
        renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    } finally {
      for (const g of geometries) g.dispose();
      material.dispose();
    }
  };
  const result = queue.then(work, work);
  queue = result.catch(() => undefined);
  return result;
}
