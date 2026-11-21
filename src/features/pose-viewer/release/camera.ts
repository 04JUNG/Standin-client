import * as THREE from "three";
export type ReleaseCamera = {
  camera: number[][];
  origin: number[];
  anchor_camera_xyz: number[];
  projection: "orthographic" | "perspective";
  inverse_distance: number;
  pixel_scale: number;
  offset: number[];
  image_size: number[];
  embedded_in_fbx: false;
};
/** RC4 uses Blender world metres and a +Z-toward-viewer camera basis. */
export function releaseCamera(c: ReleaseCamera): THREE.Camera {
  const flat = [
    ...c.camera.flat(),
    ...c.origin,
    ...c.anchor_camera_xyz,
    c.inverse_distance,
    c.pixel_scale,
    ...c.offset,
    ...c.image_size,
  ];
  if (
    c.camera.length !== 3 ||
    c.camera.some((r) => r.length !== 3) ||
    c.origin.length !== 3 ||
    c.anchor_camera_xyz.length !== 3 ||
    c.offset.length !== 2 ||
    c.image_size.length !== 2 ||
    !flat.every(Number.isFinite) ||
    c.pixel_scale <= 0 ||
    c.inverse_distance < 0 ||
    c.image_size.some((n) => n <= 0)
  )
    throw new Error("invalid camera");
  const basis = new THREE.Matrix4().set(
    c.camera[0][0],
    c.camera[0][1],
    c.camera[0][2],
    0,
    c.camera[1][0],
    c.camera[1][1],
    c.camera[1][2],
    0,
    c.camera[2][0],
    c.camera[2][1],
    c.camera[2][2],
    0,
    0,
    0,
    0,
    1,
  );
  const columns = [0, 1, 2].map((i) => new THREE.Vector3().setFromMatrixColumn(basis, i));
  if (
    columns.some((v) => Math.abs(v.length() - 1) > 1e-4) ||
    Math.abs(columns[0].dot(columns[1])) > 1e-4 ||
    Math.abs(columns[0].dot(columns[2])) > 1e-4 ||
    Math.abs(columns[1].dot(columns[2])) > 1e-4 ||
    Math.abs(basis.determinant() - 1) > 1e-4
  )
    throw new Error("invalid camera basis");
  const [w, h] = c.image_size,
    s = c.pixel_scale,
    [ox, oy] = c.offset;
  const perspective = c.projection === "perspective";
  if (perspective && c.inverse_distance <= 0) throw new Error("invalid perspective");
  const d = perspective ? 1 / c.inverse_distance : 100;
  const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective
    ? new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(2 * Math.atan(h / (2 * s * d))),
        w / h,
        0.00001,
        10000,
      )
    : new THREE.OrthographicCamera(-ox / s, (w - ox) / s, oy / s, (oy - h) / s, 0.00001, 10000);
  const anchor = perspective
    ? new THREE.Vector3(...(c.anchor_camera_xyz as [number, number, number]))
    : new THREE.Vector3();
  camera.position
    .copy(anchor.add(new THREE.Vector3(0, 0, d)).applyMatrix4(basis))
    .add(new THREE.Vector3(...(c.origin as [number, number, number])));
  camera.quaternion.setFromRotationMatrix(basis);
  camera.updateMatrixWorld(true);
  if (perspective) {
    camera.projectionMatrix.elements[8] = -((2 * (s * c.anchor_camera_xyz[0] + ox)) / w - 1);
    camera.projectionMatrix.elements[9] = -(1 - (2 * (oy - s * c.anchor_camera_xyz[1])) / h);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  return camera;
}
