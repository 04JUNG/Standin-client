import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BodyOutlineRenderer } from "./BodyOutlineRenderer";
import { PersonOutlineSettings } from "./outlineSettings";

function setup() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");
  const camera = new THREE.PerspectiveCamera();
  const observed: { width: number; alpha: number; material: THREE.ShaderMaterial }[] = [];
  let fail = false;
  const renderer = {
    autoClear: true,
    shadowMap: { enabled: true },
    getViewport: (v: THREE.Vector4) => v.set(0, 0, 400, 600),
    render: vi.fn(() => {
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible) return;
        const material = Array.isArray(o.material) ? o.material[0] : o.material;
        if (material instanceof THREE.ShaderMaterial) {
          o.onBeforeRender(
            renderer as unknown as THREE.WebGLRenderer,
            scene,
            camera,
            o.geometry,
            material,
            null!,
          );
          observed.push({
            width: material.uniforms.outlineWidth.value,
            alpha: material.opacity,
            material,
          });
          if (fail) throw new Error("GPU failure");
        }
      });
    }),
  };
  const pass = new BodyOutlineRenderer(renderer as unknown as THREE.WebGLRenderer);
  return {
    scene,
    camera,
    renderer,
    pass,
    observed,
    failNextOutline: () => {
      fail = true;
    },
  };
}

describe("body outline lifetime and render boundary", () => {
  it("0 uses only the original render and preserves the exact material/geometry", () => {
    const t = setup(),
      mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const material = mesh.material,
      geometry = mesh.geometry;
    t.scene.add(mesh);
    t.pass.setWidth(mesh, 0);
    t.pass.render(t.scene, t.camera);
    expect(t.renderer.render).toHaveBeenCalledTimes(1);
    expect(t.observed).toHaveLength(0);
    expect(mesh.material).toBe(material);
    expect(mesh.geometry).toBe(geometry);
  });

  it("uses independent widths on people sharing a skin and restores all borrowed state", () => {
    const t = setup(),
      skin = new THREE.MeshStandardMaterial({ color: "red", opacity: 0.8 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), skin),
      b = a.clone();
    const helper = new THREE.Mesh(new THREE.BoxGeometry(), skin);
    const before = vi.fn();
    a.onBeforeRender = before;
    const background = t.scene.background;
    t.scene.add(a, b, helper);
    t.pass.setWidth(a, 0.65);
    t.pass.setWidth(b, 2);
    t.pass.render(t.scene, t.camera);
    expect(t.observed.map((v) => v.width)).toEqual([0.65, 2]);
    expect(t.observed.map((v) => v.alpha)).toEqual([1, 1]);
    expect(t.observed[0].material.fragmentShader).toContain("vec4(0.0, 0.0, 0.0, 1.0)");
    expect(a.material).toBe(skin);
    expect(b.material).toBe(skin);
    expect(helper.visible).toBe(true);
    expect(a.onBeforeRender).toBe(before);
    expect(t.scene.background).toBe(background);
    expect(t.renderer.autoClear).toBe(true);
    expect(t.renderer.shadowMap.enabled).toBe(true);
    expect(skin.opacity).toBe(0.8);
  });

  it("restores scene, visibility, material arrays and callbacks after a render exception", () => {
    const t = setup(),
      materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials);
    const other = mesh.clone();
    const before = mesh.onBeforeRender,
      background = t.scene.background;
    t.scene.add(mesh, other);
    t.pass.setWidth(mesh, 1);
    t.failNextOutline();
    expect(() => t.pass.render(t.scene, t.camera)).toThrow("GPU failure");
    expect(mesh.material).toBe(materials);
    expect(mesh.onBeforeRender).toBe(before);
    expect(other.visible).toBe(true);
    expect(t.scene.background).toBe(background);
    expect(t.renderer.autoClear).toBe(true);
  });

  it("disposes stale outline materials after skin replacement and on disable/dispose", () => {
    const t = setup(),
      mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const sourceDispose = vi.spyOn(mesh.material, "dispose");
    t.scene.add(mesh);
    t.pass.setWidth(mesh, 1);
    t.pass.render(t.scene, t.camera);
    const first = vi.spyOn(t.observed[0].material, "dispose");
    mesh.material = new THREE.MeshStandardMaterial();
    t.pass.render(t.scene, t.camera);
    expect(first).toHaveBeenCalledTimes(1);
    const second = vi.spyOn(t.observed[1].material, "dispose");
    t.pass.setWidth(mesh, 0);
    t.pass.render(t.scene, t.camera);
    expect(second).toHaveBeenCalledTimes(1);
    t.pass.dispose();
    t.pass.dispose();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(() => t.pass.render(t.scene, t.camera)).toThrow("disposed");
  });
});

it("keeps per-person settings across skin/model changes, clamps inputs, resets for a new job", () => {
  const settings = new PersonOutlineSettings();
  expect(settings.get(0)).toBe(0);
  settings.set(0, 1.2);
  settings.set(1, 2);
  expect(settings.get(0)).toBe(1.2);
  settings.set(1, Infinity);
  expect(settings.get(1)).toBe(0);
  settings.set(1, 99);
  expect(settings.get(1)).toBe(2);
  settings.set(-1, 1);
  expect(settings.get(-1)).toBe(0);
  settings.clear();
  expect(settings.get(0)).toBe(0);
  expect(settings.get(1)).toBe(0);
});
