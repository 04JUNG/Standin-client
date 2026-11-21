import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as THREE from "three";
import type { ApprovedModel } from "./approvedModels";
import { referencePose } from "./pose";
import { correctApprovedPose } from "./correctives";
import { referenceSurface } from "./surface";
import golden from "@/test/fixtures/approved-preview/golden.json";

const models = new Map<string, ApprovedModel>();
function model(gender: string) {
  if (!models.has(gender))
    models.set(
      gender,
      JSON.parse(
        gunzipSync(
          readFileSync(
            resolve(
              "src/features/pose-viewer/preview/humanReference/approvedAssets",
              gender + ".json.gz",
            ),
          ),
        ).toString(),
      ),
    );
  return models.get(gender)!;
}
it.each(golden)(
  "matches the approved Blender shoulder for $gender / $pose without a server solve",
  (row) => {
    const m = model(row.gender);
    const text = readFileSync(
      resolve("src/test/fixtures/approved-preview", row.pose + ".bvh"),
      "utf8",
    );
    expect(createHash("sha256").update(text).digest("hex")).toBe(row.bvhSha256);
    const pristine = createHash("sha256").update(JSON.stringify(m.template.meshes)).digest("hex");
    const corrected = correctApprovedPose(
      m.template,
      referencePose(m.template, text, true),
      m.corrections,
    );
    for (const [i, j] of m.template.joints.entries()) {
      const expected = row.joints[j.role as keyof typeof row.joints];
      expect(
        corrected.pose.positions[i].distanceTo(new THREE.Vector3(...expected)) * 1000,
        j.role,
      ).toBeLessThan(0.3);
    }
    for (const shape of m.corrections.shapes)
      expect(
        Math.abs(
          corrected.active[shape.name] -
            ((row.active as Record<string, number | undefined>)[shape.name] ?? 0),
        ),
        shape.name,
      ).toBeLessThan(0.004);
    const surface = referenceSurface(m.template, text, m.skin, m.corrections);
    try {
      const geometry = (surface.body.children[0] as THREE.Mesh).geometry;
      const p = geometry.getAttribute("position"),
        n = geometry.getAttribute("normal");
      const errors = row.samples
        .map(([i, x, y, z]) => Math.hypot(p.getX(i) - x, p.getY(i) - y, p.getZ(i) - z) * 1000)
        .sort((a, b) => a - b);
      expect(errors.at(-1)).toBeLessThan(2.5);
      expect(errors[Math.floor(errors.length * 0.95)]).toBeLessThan(0.3);
      expect(Array.from(n.array).every(Number.isFinite)).toBe(true);
      expect(createHash("sha256").update(JSON.stringify(m.template.meshes)).digest("hex")).toBe(
        pristine,
      );
    } finally {
      surface.release();
    }
    if (row.pose === "normal" || row.pose === "slouch") {
      const old = referencePose(m.template, text);
      const i = m.template.joints.findIndex((j) => j.role === "shoulder.L");
      expect(
        old.positions[i].distanceTo(new THREE.Vector3(...row.joints["shoulder.L"])) * 1000,
      ).toBeGreaterThan(50);
    }
  },
);
