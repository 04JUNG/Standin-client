import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

/** Flatten the evaluated saved pose, including skin/morph deformation, for our static shader. */
export function finalFbxSurface(source: THREE.Group) {
  const result = new THREE.Group();
  const mixer = new THREE.AnimationMixer(source);
  try {
    if (source.animations.length) {
      mixer.clipAction(source.animations[0]!).play();
      mixer.setTime(0); // same first saved frame used by the final-file PNG path
    }
    source.updateMatrixWorld(true);
    source.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
    });
    let count = 0;
    source.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const positions = o.geometry.getAttribute("position");
      count += positions.count;
      if (count > 1_000_000) throw new Error("geometry size limit");
      const vertices = new Float32Array(positions.count * 3);
      const sourceNormals = o.geometry.getAttribute("normal");
      const normals = sourceNormals ? new Float32Array(positions.count * 3) : undefined;
      const worldNormal = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      const boneNormals =
        o instanceof THREE.SkinnedMesh
          ? o.skeleton.bones.map((bone, i) =>
              new THREE.Matrix3().setFromMatrix4(
                new THREE.Matrix4()
                  .multiplyMatrices(o.bindMatrixInverse, bone.matrixWorld)
                  .multiply(o.skeleton.boneInverses[i]!)
                  .multiply(o.bindMatrix),
              ),
            )
          : undefined;
      const normal = new THREE.Vector3(),
        weighted = new THREE.Vector3(),
        part = new THREE.Vector3();
      const point = new THREE.Vector3(),
        delta = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        o.getVertexPosition(i, point).applyMatrix4(o.matrixWorld);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("invalid vertex");
        point.toArray(vertices, i * 3);
        if (sourceNormals && normals) {
          normal.fromBufferAttribute(sourceNormals, i);
          const morphs = o.geometry.morphAttributes.normal;
          if (morphs && o.morphTargetInfluences) {
            part.copy(normal);
            for (let j = 0; j < morphs.length; j++) {
              const influence = o.morphTargetInfluences[j] ?? 0;
              if (!influence) continue;
              delta.fromBufferAttribute(morphs[j]!, i);
              if (!o.geometry.morphTargetsRelative) delta.sub(part);
              normal.addScaledVector(delta, influence);
            }
          }
          if (boneNormals) {
            const indices = o.geometry.getAttribute("skinIndex"),
              weights = o.geometry.getAttribute("skinWeight");
            weighted.set(0, 0, 0);
            for (let k = 0; k < 4; k++) {
              const weight = weights.getComponent(i, k);
              if (weight)
                weighted.addScaledVector(
                  part.copy(normal).applyMatrix3(boneNormals[indices.getComponent(i, k)]!),
                  weight,
                );
            }
            normal.copy(weighted);
          }
          if (![normal.x, normal.y, normal.z].every(Number.isFinite))
            throw new Error("invalid normal");
          normal
            .applyMatrix3(worldNormal)
            .normalize()
            .toArray(normals, i * 3);
        }
      }
      const geometry = o.geometry.clone();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.morphAttributes = {};
      geometry.deleteAttribute("skinIndex");
      geometry.deleteAttribute("skinWeight");
      if (normals) geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      else geometry.computeVertexNormals();
      result.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    });
    if (!count) throw new Error("empty FBX");
    return result;
  } catch (error) {
    disposeFbx(result);
    throw error;
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(source);
    disposeFbx(source);
  }
}
function disposeFbx(body: THREE.Group) {
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material])
        material.dispose();
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    }
  });
}
export function parseFinalFbx(data: ArrayBuffer) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(() => {
    throw new Error("external FBX resource");
  });
  return finalFbxSurface(new FBXLoader(manager).parse(data, ""));
}
