import { expect, it } from "vitest";
import {
  appearanceSchema,
  outlineAppearance,
  sameAppearance,
  ACCEPTED_OUTLINE_EXPRESSIONS,
  outlineReceiptSchema,
} from "./appearance";
it("keeps zero absent and never interprets CSS width as physical length", () => {
  expect(outlineAppearance(0)).toBeUndefined();
  expect(outlineAppearance(NaN)).toBeUndefined();
  expect(outlineAppearance(2)).toEqual({ version: "fbx-outline-v1", width: 2 });
  expect(sameAppearance(undefined, { version: "fbx-outline-v1", width: 0 })).toBe(true);
  expect(sameAppearance(outlineAppearance(1), outlineAppearance(2))).toBe(false);
});
it.each([true, "1", -1, 2.1, NaN, Infinity])("rejects malformed wire width %s", (width) => {
  expect(appearanceSchema.safeParse({ version: "fbx-outline-v1", width }).success).toBe(false);
});
it("cannot treat a server flag or rejected culling expression as CSP certification", () => {
  expect(ACCEPTED_OUTLINE_EXPRESSIONS.size).toBe(0);
  const appearance = { version: "fbx-outline-v1", width: 1 };
  const digest = "a".repeat(64);
  const expression = "skinned-inverted-hull-fbx-culling-v1";
  const mapping = "stature-relative-v1-experimental";
  // All transport lineage is valid and upstream claims certification; known failure still wins.
  expect(
    outlineReceiptSchema.safeParse({
      artifactSha256: digest,
      artifactBytes: 3,
      bindingSha256: digest,
      appearance,
      sourceArtifactSha256: digest,
      runtimeRevision: digest,
      expression,
      mapping,
      proof: {
        version: "outlined-fbx-receipt-v1",
        expression,
        mapping,
        runtime_revision: digest,
        source_artifact_sha256: digest,
        fbx_sha256: digest,
        appearance,
        binding_sha256: digest,
        character_sha256: digest,
        output_scope: "full",
        base: { typed_fbx_values_preserved: true },
        outline: { skin_verified: true, displacement_verified: true, max_displacement_error_m: 0 },
        file_verified: true,
        csp_certified: true,
      },
    }).success,
  ).toBe(false);
  expect(
    appearanceSchema.safeParse({ version: "fbx-outline-v1", width: 1, certified: true }).success,
  ).toBe(false);
});
