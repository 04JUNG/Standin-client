import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BodyOutlineRenderer } from "../../src/features/pose-viewer/outline/BodyOutlineRenderer";
import { OUTLINE_SAMPLES } from "../../src/features/pose-viewer/outline/outlineSettings";

export type Choice = { model: string; pose: string; skin: string; angle: string; detail: string };
export const initialChoice: Choice = {
  model: "male",
  pose: "standing",
  skin: "default",
  angle: "front",
  detail: "full",
};
const materialList = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]);

function disposeSurface(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      materialList(o.material).forEach((m) => materials.add(m));
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    }
  });
  for (const m of materials) m.dispose();
}

export class OutlineViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  readonly outline: BodyOutlineRenderer;
  readonly controls: OrbitControls;
  readonly diagnostics = { loads: 0, draws: 0, errors: [] as string[] };
  body?: THREE.Group;
  choice = { ...initialChoice };
  width = 0;
  private token = 0;
  private closed = false;
  private loadedKey = "";
  private appliedSkin = "";
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private skinMaterials = new Set<THREE.Material>();
  private textures = new Map<string, THREE.Texture>();
  private resize: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.outline = new BodyOutlineRenderer(this.renderer);
    this.scene.background = new THREE.Color("#edece5");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4ad, 2));
    for (const [position, intensity] of [
      [[2, 4, 5], 2.3],
      [[-3, 2, 1], 0.8],
      [[1, 3, -4], 1.4],
    ] as const) {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(position[0], position[1], position[2]);
      this.scene.add(light);
    }
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 8;
    this.controls.addEventListener("change", () => this.draw());
    this.resize = new ResizeObserver(() => this.frame());
    this.resize.observe(canvas);
  }

  private clearBody() {
    if (this.body) {
      this.outline.remove(this.body);
      this.scene.remove(this.body);
      for (const [mesh, material] of this.originals) mesh.material = material;
      disposeSurface(this.body);
    }
    this.body = undefined;
    this.originals.clear();
    for (const m of this.skinMaterials) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.skinMaterials.clear();
    this.textures.clear();
  }

  async setChoice(next: Choice) {
    const token = ++this.token;
    const modelKey = `${next.model}-${next.pose}`;
    const reload = !this.body || modelKey !== this.loadedKey;
    const skinKey = `${next.model}:${next.skin}`;
    const reskin = reload || skinKey !== this.appliedSkin;
    this.choice = { ...next };
    if (reload) {
      const file = next.pose === "rig" ? next.model : `${next.model}-${next.pose}`;
      const { scene: body } = await new GLTFLoader().loadAsync(`assets/${file}.glb`);
      if (token !== this.token || this.closed) {
        disposeSurface(body);
        return;
      }
      this.clearBody();
      this.body = body;
      this.loadedKey = modelKey;
      this.diagnostics.loads++;
      body.traverse((o) => {
        if (o instanceof THREE.Mesh) this.originals.set(o, o.material);
      });
      // Preview-only pose exercise on a rigged asset; source files are untouched.
      if (next.pose === "rig") {
        body.traverse((o) => {
          if (o instanceof THREE.Bone && o.name.includes("LeftForeArm")) o.rotateY(0.9);
        });
      }
      this.scene.add(body);
    }
    if (reskin) {
      let texture: THREE.Texture | undefined;
      if (next.skin !== "default") {
        const key = `${next.model}-${next.skin}`;
        texture = this.textures.get(key);
        if (!texture) {
          texture = await new THREE.TextureLoader().loadAsync(`assets/${key}.png`);
          if (token !== this.token || this.closed) {
            texture.dispose();
            return;
          }
          texture.flipY = false;
          texture.colorSpace = THREE.SRGBColorSpace;
          this.textures.set(key, texture);
        }
      }
      for (const m of this.skinMaterials) m.dispose();
      this.skinMaterials.clear();
      for (const [mesh, material] of this.originals) {
        if (!texture) mesh.material = material;
        else {
          const skin = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.8,
            metalness: 0,
          });
          this.skinMaterials.add(skin);
          mesh.material = skin;
        }
      }
      this.appliedSkin = skinKey;
    }
    this.frame();
  }

  setWidth(width: number) {
    this.width = width;
    this.draw();
  }

  frame() {
    if (this.closed) return;
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    const { detail, angle, pose } = this.choice;
    const center = new THREE.Vector3(0, pose === "seated" ? 0.97 : 0.9, 0);
    let half = 1.05;
    if (detail === "face") {
      center.set(0, 1.6, 0);
      half = 0.23;
    }
    if (detail === "hand") {
      if (this.body) {
        this.body.updateMatrixWorld(true);
        // Evaluated pose meshes have no bones; these close-up coordinates match the standing pose.
        const bone = this.body.getObjectByProperty("name", "mixamorigLeftHand");
        if (bone) bone.getWorldPosition(center);
        else center.set(pose === "standing" ? 0.35 : 0.47, pose === "standing" ? 0.87 : 1.11, 0);
      }
      half = 0.17;
    }
    const aspect = width / height;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    const theta = { front: 0, quarter: Math.PI / 4, side: Math.PI / 2, back: Math.PI }[angle] ?? 0;
    this.camera.position.set(center.x + Math.sin(theta) * 5, center.y + 0.03, Math.cos(theta) * 5);
    this.controls.target.copy(center);
    this.camera.lookAt(center);
    this.controls.update();
    this.draw();
  }

  draw() {
    if (this.closed) return;
    if (this.body) this.outline.setWidth(this.body, this.width);
    this.outline.render(this.scene, this.camera);
    this.diagnostics.draws++;
  }

  capture() {
    this.draw();
    return this.canvas.toDataURL("image/png");
  }

  compare() {
    const width = this.width;
    const images = OUTLINE_SAMPLES.map((sample) => {
      this.setWidth(sample);
      return this.capture();
    });
    this.setWidth(width);
    return images;
  }

  /** Isolated evidence only: the borrowed source surface has no exported outline shell. */
  async probeExportBoundary() {
    if (!this.body) throw new Error("No model loaded");
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const exporter = new GLTFExporter();
    const saved = this.width;
    try {
      this.setWidth(0);
      const off = (await exporter.parseAsync(this.body, { binary: true })) as ArrayBuffer;
      this.setWidth(2);
      const on = (await exporter.parseAsync(this.body, { binary: true })) as ArrayBuffer;
      const hash = async (data: ArrayBuffer) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      const [offSha256, onSha256] = await Promise.all([hash(off), hash(on)]);
      return {
        format: "GLB",
        offSha256,
        onSha256,
        identical: offSha256 === onSha256,
        bytes: [off.byteLength, on.byteLength],
        interpretation:
          "Preview render state is absent from this exported surface. This does not validate FBX or CSP import.",
      };
    } finally {
      this.setWidth(saved);
    }
  }

  /** Identity checks around the pass: no vertex, bone, morph or material reference changes. */
  identity() {
    const meshes: unknown[] = [];
    this.body?.traverse((o) => {
      if (o instanceof THREE.Mesh)
        meshes.push({
          geometry: o.geometry.uuid,
          material: materialList(o.material).map((m) => m.uuid),
          position: Array.from(o.geometry.getAttribute("position").array),
          weights: o.geometry.getAttribute("skinWeight")
            ? Array.from(o.geometry.getAttribute("skinWeight").array)
            : [],
          morphs: o.morphTargetInfluences?.slice(),
          bones:
            o instanceof THREE.SkinnedMesh ? o.skeleton.bones.map((b) => b.matrix.toArray()) : [],
          matrix: o.matrix.toArray(),
        });
    });
    return JSON.stringify(meshes);
  }

  dispose() {
    this.closed = true;
    this.token++;
    this.resize.disconnect();
    this.controls.dispose();
    this.clearBody();
    this.outline.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
