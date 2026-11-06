import * as THREE from "three";
/** Isolate the existing library lighting from view-only skin tint; cached/poster shaders stay intact. */
export function appearanceMaterial(source: THREE.Material) {
  const owned = source.clone();
  if (owned instanceof THREE.ShaderMaterial && owned.fragmentShader.includes("0.72 * (ambient")) {
    owned.uniforms.baseColor = { value: new THREE.Vector3(0.72, 0.72, 0.72) };
    owned.fragmentShader = owned.fragmentShader
      .replace("uniform vec3 ambient,", "uniform vec3 baseColor, ambient,")
      .replace("0.72 * (ambient", "baseColor * (ambient");
  }
  return owned;
}
