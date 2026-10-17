import { expect, it } from "vitest";
import { Vector3 } from "three";
import { bvhGeometry, projectPoint } from "./bvhPreview";
import type { RenderCamera } from "../api/posePresentation";
export const camera: RenderCamera = {
  version: "pose-preview-camera-v1",
  projection: "orthographic",
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  yaw_degrees: 0,
  pitch_degrees: 0,
  roll_degrees: 0,
  distance_torso: null,
  basis: "right-handed-Y-up",
  rotation_order: "Rz@Rx@Ry_column_vectors",
  origin: "hip_midpoint",
  scale: "hip_to_shoulder_midpoint_length",
  screen_y: "down",
  projection_rule: "xy=(x,-y)",
  projection_matches_search: false,
  fit_to_rough_pixels: false,
  bvh_camera_rotation_applied: false,
};
// Authored minimal skeleton; no private team BVH is committed.
export function syntheticBvh() {
  const joint = (name: string, offset: string) =>
    `JOINT ${name}\n{\nOFFSET ${offset}\nCHANNELS 3 Zrotation Xrotation Yrotation\nEnd Site\n{\nOFFSET 0 1 0\n}\n}\n`;
  return `HIERARCHY\nROOT Hips\n{\nOFFSET 0 0 0\nCHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation\n${joint("LeftUpLeg", "1 0 0")}${joint("RightUpLeg", "-1 0 0")}${joint("LeftArm", "2 4 0")}${joint("RightArm", "-2 4 0")}${joint("Head", "0 6 0")}\n}\nMOTION\nFrames: 1\nFrame Time: 0.033333\n${Array(21).fill(0).join(" ")}\n`;
}
it("parses frame zero and normalizes actual BVH anchors", () => {
  const g = bvhGeometry(syntheticBvh(), "full", camera);
  expect(g.links.length).toBeGreaterThan(4);
  expect(g.points.every((p) => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
});
it("matches the contract's perspective divide and rejects points behind the camera", () => {
  const c = {
    ...camera,
    projection: "perspective" as const,
    distance_torso: 4,
    projection_rule: "xy=(x,-y)/(z+distance_torso)" as const,
  };
  expect(projectPoint(new Vector3(2, 4, 0), c)).toEqual([0.5, -1]);
  expect(() => projectPoint(new Vector3(0, 0, -4), c)).toThrow();
});
it("scope filtering never invents missing geometry or a default full body", () => {
  expect(bvhGeometry(syntheticBvh(), "half", camera).points.length).toBeLessThan(
    bvhGeometry(syntheticBvh(), "full", camera).points.length,
  );
  expect(() => bvhGeometry(syntheticBvh(), null, camera)).toThrow();
  expect(() =>
    bvhGeometry(syntheticBvh(), "full", { ...camera, bvh_camera_rotation_applied: true } as never),
  ).toThrow();
});

it("half scope removes end sites belonging to cropped leg branches", () => {
  const half = bvhGeometry(syntheticBvh(), "half", camera);
  expect(half.points.every((p) => Math.abs(p.x) !== 0.25)).toBe(true);
});
