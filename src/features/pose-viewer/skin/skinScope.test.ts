import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/errors";
import {
  isSkinFailure,
  permanentSkinFailure,
  skinFailureScope,
  skinScopeError,
  skinSupportsScope,
  skinUnavailableError,
  skinUnavailableSchema,
} from "./skinScope";

describe("skin output-scope rule", () => {
  it("allows skins only on full meshes, like the BFF", () => {
    expect(skinSupportsScope("full")).toBe(true);
    for (const scope of ["half", "bust", "shoulder_head", "head"] as const)
      expect(skinSupportsScope(scope)).toBe(false);
  });

  it("turns the head reason into a scope, permanent or transient failure", () => {
    const scope = skinUnavailableError({ code: "SKIN_UNSUPPORTED", outputScope: "half" });
    expect(scope).toMatchObject({ status: 422, code: "SKIN_UNSUPPORTED" });
    expect(skinFailureScope(scope)).toBe("half");
    expect(permanentSkinFailure(scope)).toBe(true);

    const uv = skinUnavailableError({ code: "SKIN_UV_INCOMPATIBLE" });
    expect(uv).toMatchObject({ status: 422, code: "SKIN_UV_INCOMPATIBLE" });
    expect(skinFailureScope(uv)).toBeUndefined();

    // Outages stay 503 so the controller's existing auto-recovery applies.
    expect(skinUnavailableError({ code: "SKIN_UNAVAILABLE" })).toMatchObject({
      status: 503,
      code: "SKIN_UNAVAILABLE",
    });
    expect(permanentSkinFailure(skinUnavailableError({ code: "SKIN_UNAVAILABLE" }))).toBe(false);
    // Older servers give no reason: unchanged SKIN_DISABLED.
    expect(skinUnavailableError()).toMatchObject({ status: 503, code: "SKIN_DISABLED" });
    // Available, but the chosen id is not listed for this selection.
    expect(skinUnavailableError(undefined, true)).toMatchObject({
      status: 422,
      code: "SKIN_UNSUPPORTED",
    });
    // A "full" scope is not a reason to block.
    expect(
      skinFailureScope(skinUnavailableError({ code: "SKIN_UNSUPPORTED", outputScope: "full" })),
    ).toBeUndefined();
  });

  it("reads the scope only from SKIN_UNSUPPORTED details", () => {
    expect(skinFailureScope(skinScopeError("bust"))).toBe("bust");
    expect(
      skinFailureScope(new ApiError(503, "SKIN_DISABLED", "", undefined, { outputScope: "half" })),
    ).toBeUndefined();
    expect(
      skinFailureScope(new ApiError(422, "SKIN_UNSUPPORTED", "", undefined, { outputScope: "x" })),
    ).toBeUndefined();
    expect(skinFailureScope(new Error("SKIN_UNSUPPORTED"))).toBeUndefined();
    expect(isSkinFailure(new ApiError(503, "SKIN_DISABLED", ""))).toBe(true);
    expect(isSkinFailure(new ApiError(503, "OUTLINE_DISABLED", ""))).toBe(false);
  });

  it("accepts only skin codes and known scopes from the server", () => {
    expect(
      skinUnavailableSchema.safeParse({ code: "SKIN_UNSUPPORTED", outputScope: "half" }).success,
    ).toBe(true);
    expect(skinUnavailableSchema.safeParse({ code: "INTERNAL" }).success).toBe(false);
    expect(
      skinUnavailableSchema.safeParse({ code: "SKIN_UNSUPPORTED", outputScope: "waist" }).success,
    ).toBe(false);
  });
});
