import * as THREE from "three";

// Paired with Standin-server/converter/preview_studio.sl and preview_style.py.
// Camera-space diffuse lighting is independent of model scale and source materials.
export { PREVIEW_BACKGROUND } from "./previewStyleContract";

export function libraryPreviewMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ambient: { value: new THREE.Vector3(0.28, 0.29, 0.31) },
      keyColor: { value: new THREE.Vector3(0.38, 0.39, 0.41) },
      fillColor: { value: new THREE.Vector3(0.13, 0.13, 0.13) },
      keyDirection: { value: new THREE.Vector3(-0.4, 0.5, 0.768115) },
      fillDirection: { value: new THREE.Vector3(0.8, 0, 0.6) },
    },
    vertexShader: `
      varying vec3 previewNormal;
      void main() {
        previewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 previewNormal;
      uniform vec3 ambient, keyColor, fillColor, keyDirection, fillDirection;
      void main() {
        vec3 normal = normalize(previewNormal);
        float key = clamp((dot(normal, keyDirection) + 0.75) / 1.75, 0.0, 1.0);
        float fill = clamp((dot(normal, fillDirection) + 0.85) / 1.85, 0.0, 1.0);
        gl_FragColor = vec4(0.72 * (ambient + keyColor * key + fillColor * fill), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
