import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { releaseCamera, type ReleaseCamera } from "./camera";
describe("RC4 exact projection", () => {
  for (const inv of [0, 0.2])
    for (const yaw of [0, 0.7, 1.4])
      it(`matches frozen pinhole ${inv} ${yaw}`, () => {
        const c: ReleaseCamera = {
          camera: [
            [Math.cos(yaw), 0, Math.sin(yaw)],
            [0, 1, 0],
            [-Math.sin(yaw), 0, Math.cos(yaw)],
          ],
          origin: [0.1, 0.2, 0.3],
          anchor_camera_xyz: [0.2, 0.4, 0.1],
          projection: inv ? "perspective" : "orthographic",
          inverse_distance: inv,
          pixel_scale: 300,
          offset: [220, 500],
          image_size: [535, 687],
          embedded_in_fbx: false,
        };
        const camera = releaseCamera(c);
        for (const p of [
          [0.1, 0.8, 0.7],
          [-0.5, 1.1, 0.2],
          [0.3, 1.3, -0.4],
        ]) {
          const q = [0, 1, 2].map((j) =>
            p.reduce((s, v, i) => s + (v - c.origin[i]) * c.camera[i][j], 0),
          );
          const den = 1 - (q[2] - c.anchor_camera_xyz[2]) * inv;
          const expected = [
            ((q[0] - c.anchor_camera_xyz[0]) / den + c.anchor_camera_xyz[0]) * 300 + 220,
            -((q[1] - c.anchor_camera_xyz[1]) / den + c.anchor_camera_xyz[1]) * 300 + 500,
          ];
          const ndc = new Vector3(...(p as [number, number, number])).project(camera);
          expect(((ndc.x + 1) * 535) / 2).toBeCloseTo(expected[0], 8);
          expect(((1 - ndc.y) * 687) / 2).toBeCloseTo(expected[1], 8);
        }
      });
  it("rejects reflection and invalid scale", () => {
    const c: ReleaseCamera = {
      camera: [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      origin: [0, 0, 0],
      anchor_camera_xyz: [0, 0, 0],
      projection: "orthographic",
      inverse_distance: 0,
      pixel_scale: 1,
      offset: [0, 0],
      image_size: [10, 10],
      embedded_in_fbx: false,
    };
    expect(() => releaseCamera(c)).toThrow();
  });
});
