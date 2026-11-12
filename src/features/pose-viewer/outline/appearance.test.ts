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
  expect(ACCEPTED_OUTLINE_EXPRESSIONS.has("skinned-inverted-hull-fbx-culling-v1")).toBe(false);
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

function acceptedReceipt() {
  const digest = "a".repeat(64);
  const expression = "skinned-outward-transparent-native-outline-v2";
  const mapping = "csp-native-scope-stature-v2-experimental";
  const appearance = { version: "fbx-outline-v1", width: 2 };
  return {
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
      character_id: "male-default83-v0-7-6-p1",
      character_sha256: "085dd9c65a3a66035f7e0ce9e0a9171b9abb0e33dada92194676d92e00c8b026",
      output_scope: "full",
      culling: "CullingOff",
      base: { typed_fbx_values_preserved: true },
      outline: {
        manifest: { surface: "outward-transparent", culling: "CullingOff" },
        skin_verified: true,
        displacement_verified: true,
        max_displacement_error_m: 0,
      },
      file_verified: true,
      csp_certified: true,
    },
  };
}
it("accepts only the observed v2 representation and exact tested targets", () => {
  expect(outlineReceiptSchema.safeParse(acceptedReceipt()).success).toBe(true);
  for (const width of [0.01, 0.5, 0.65, 1, 1.2, 2]) {
    const r = acceptedReceipt();
    r.appearance.width = width;
    expect(outlineReceiptSchema.safeParse(r).success).toBe(true);
  }
});
it.each([
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.character_id = "female-default80-v0-3-9-p1";
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.culling = "CullingOnCCW";
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.outline.manifest.surface = "inverted-opaque";
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.outline.manifest.culling = "CullingOnCW";
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.mapping = "stature-relative-v1-experimental";
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.expression = "skinned-inverted-hull-fbx-culling-v1";
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.character_sha256 = "b".repeat(64);
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.fbx_sha256 = "b".repeat(64);
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.binding_sha256 = "b".repeat(64);
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.csp_certified = false;
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.output_scope = "half";
    r.appearance.width = 0.65;
  },
  (r: ReturnType<typeof acceptedReceipt>) => {
    r.proof.output_scope = "head";
    r.appearance.width = 1;
  },
])("rejects changed proof, unsupported model and untested width/scope %#", (mutate) => {
  const r = acceptedReceipt();
  mutate(r);
  expect(outlineReceiptSchema.safeParse(r).success).toBe(false);
});

it("accepts exact current anatomy full receipts while rejecting copied hashes and crops", async () => {
  const { SKIN_ASSET_PINS } = await import("../skin/skinAssetPins");
  const pins = SKIN_ASSET_PINS.filter((p) => p.continuousOutline);
  expect(pins).toHaveLength(20);
  for (const pin of pins) {
    const receipt = acceptedReceipt();
    receipt.proof.character_id = pin.characterId;
    receipt.proof.character_sha256 = pin.characterSha256;
    expect(outlineReceiptSchema.safeParse(receipt).success).toBe(true);
    receipt.proof.output_scope = "head";
    expect(outlineReceiptSchema.safeParse(receipt).success).toBe(false);
    receipt.proof.output_scope = "full";
    receipt.proof.character_sha256 = "f".repeat(64);
    expect(outlineReceiptSchema.safeParse(receipt).success).toBe(false);
  }
});
