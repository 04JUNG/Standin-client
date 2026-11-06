import * as THREE from "three";
import { clampOutlineWidth } from "./outlineSettings";

// Same deformation chunks as Three r186 OutlineEffect, with a CSS-pixel XY offset.
// The real geometry, transforms, bind matrices, skin weights and morph values stay untouched.
const vertexShader = `
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
uniform float outlineWidth;
uniform vec2 outlineViewport;
void main() {
  #include <uv_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <displacementmap_vertex>
  #include <project_vertex>
  vec4 normalPoint = projectionMatrix * modelViewMatrix * vec4(transformed + objectNormal, 1.0);
  // Subtract homogeneous coordinates before dividing, so this also works in perspective.
  vec2 direction = (normalPoint.xy * gl_Position.w - gl_Position.xy * normalPoint.w)
    * outlineViewport;
  float magnitude = length(direction);
  if (magnitude > 0.000001) {
    gl_Position.xy += direction / magnitude * (2.0 * outlineWidth / outlineViewport) * gl_Position.w;
  }
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
}`;

const fragmentShader = `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}`;

type Surface = THREE.Material &
  Partial<
    Pick<THREE.MeshStandardMaterial, "displacementMap" | "displacementScale" | "displacementBias">
  >;

/**
 * Exterior-only body silhouette pass (default framebuffer, renderer stencil: true).
 * Uses a colorless body mask to exclude all surface interiors, regardless of shading.
 * Owns/clears the default stencil buffer while active; do not share it with another pass.
 * Call render instead of renderer.render; setWidth only changes render settings.
 * Supply the body root, not card borders, helpers or the whole scene.
 * Source materials are borrowed, restored in finally, and never disposed here.
 */
export class BodyOutlineRenderer {
  private widths = new Map<THREE.Object3D, number>();
  private materials = new Map<THREE.Material, THREE.ShaderMaterial>();
  private masks = new Map<THREE.Material, THREE.ShaderMaterial>();
  private viewport = new THREE.Vector4();
  private disposed = false;

  constructor(private renderer: THREE.WebGLRenderer) {}

  setWidth(body: THREE.Object3D, width: number) {
    if (this.disposed) return;
    const value = clampOutlineWidth(width);
    if (value === 0) this.widths.delete(body);
    else this.widths.set(body, value);
  }

  /** Release a replaced/removed body reference. Its skin and geometry remain caller-owned. */
  remove(body: THREE.Object3D) {
    this.widths.delete(body);
  }

  private widthFor(object: THREE.Object3D): number {
    for (let root: THREE.Object3D | null = object; root; root = root.parent) {
      const width = this.widths.get(root);
      if (width !== undefined) return width;
    }
    return 0;
  }

  private materialFor(source: Surface, mask = false) {
    const cache = mask ? this.masks : this.materials;
    let material = cache.get(source);
    if (!material) {
      material = new THREE.ShaderMaterial({
        name: mask ? "Standin body interior mask" : "Standin exterior outline",
        vertexShader,
        fragmentShader,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.displacementmap,
          { outlineWidth: { value: 0 }, outlineViewport: { value: new THREE.Vector2() } },
        ]),
        side: mask ? source.side : THREE.BackSide,
        colorWrite: !mask,
        depthTest: !mask,
        depthWrite: false,
        transparent: false,
        opacity: 1,
        toneMapped: false,
        clipping: true,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: mask ? THREE.AlwaysStencilFunc : THREE.NotEqualStencilFunc,
        stencilWriteMask: mask ? 0xff : 0,
        stencilZPass: mask ? THREE.ReplaceStencilOp : THREE.KeepStencilOp,
      });
      cache.set(source, material);
    }
    material.visible = source.visible;
    material.side = mask ? source.side : THREE.BackSide;
    material.clippingPlanes = source.clippingPlanes;
    material.clipIntersection = source.clipIntersection;
    const hadDisplacement = Boolean(material.uniforms.displacementMap.value);
    material.uniforms.displacementMap.value = source.displacementMap ?? null;
    material.uniforms.displacementScale.value = source.displacementScale ?? 1;
    material.uniforms.displacementBias.value = source.displacementBias ?? 0;
    Object.assign(material, { displacementMap: source.displacementMap ?? null });
    if (hadDisplacement !== Boolean(source.displacementMap)) material.needsUpdate = true;
    return material;
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.disposed) throw new Error("Body outline renderer is disposed");
    this.renderer.render(scene, camera);
    const used = new Set<THREE.Material>();
    const restore: (() => void)[] = [];
    const outlineMeshes: (() => void)[] = [];
    let stencilUsed = false;
    const { background, overrideMaterial, matrixWorldAutoUpdate } = scene;
    const { autoClear } = this.renderer;
    const shadows = this.renderer.shadowMap.enabled;
    try {
      if (!this.widths.size) return;
      if (!this.renderer.getContext().getContextAttributes()?.stencil) {
        throw new Error("Body outlines require WebGLRenderer({ stencil: true })");
      }
      stencilUsed = true;
      this.renderer.clearStencil();
      this.renderer.getViewport(this.viewport);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const width = this.widthFor(object);
          const source = object.material;
          const visible = object.visible;
          const before = object.onBeforeRender;
          restore.push(() => {
            object.material = source;
            object.visible = visible;
            object.onBeforeRender = before;
          });
          if (!width || !object.geometry.hasAttribute("normal")) {
            object.visible = false;
            return;
          }
          const convert = (mask: boolean) => {
            const material = (m: THREE.Material) => {
              used.add(m);
              return this.materialFor(m, mask);
            };
            object.material = Array.isArray(source) ? source.map(material) : material(source);
          };
          convert(true);
          outlineMeshes.push(() => convert(false));
          object.onBeforeRender = (_r, _s, _c, _g, material) => {
            const outline = material as THREE.ShaderMaterial;
            outline.uniforms.outlineWidth.value = outline.colorWrite ? width : 0;
            outline.uniforms.outlineViewport.value.set(this.viewport.z, this.viewport.w);
            // People may share a skin/material but have different outline widths.
            outline.uniformsNeedUpdate = true;
          };
        } else if (
          object instanceof THREE.Line ||
          object instanceof THREE.Points ||
          object instanceof THREE.Sprite
        ) {
          const visible = object.visible;
          restore.push(() => {
            object.visible = visible;
          });
          object.visible = false;
        }
      });
      scene.background = null;
      scene.overrideMaterial = null;
      scene.matrixWorldAutoUpdate = false;
      this.renderer.autoClear = false;
      this.renderer.shadowMap.enabled = false;
      // First mark the unexpanded surface. Only pixels outside this mask may receive ink.
      this.renderer.render(scene, camera);
      for (const swap of outlineMeshes) swap();
      this.renderer.render(scene, camera);
    } finally {
      for (const reset of restore) reset();
      scene.background = background;
      scene.overrideMaterial = overrideMaterial;
      scene.matrixWorldAutoUpdate = matrixWorldAutoUpdate;
      this.renderer.autoClear = autoClear;
      this.renderer.shadowMap.enabled = shadows;
      if (stencilUsed) this.renderer.clearStencil();
      for (const cache of [this.materials, this.masks]) {
        for (const [source, material] of cache) {
          if (!used.has(source)) {
            material.dispose();
            cache.delete(source);
          }
        }
      }
    }
  }

  dispose() {
    for (const cache of [this.materials, this.masks]) {
      for (const material of cache.values()) material.dispose();
      cache.clear();
    }
    this.widths.clear();
    this.disposed = true;
  }
}
