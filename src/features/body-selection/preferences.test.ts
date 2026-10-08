import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/client";
import { legacyPreferences } from "./preferences";
describe("preferences rollout gate", () => {
  it("uses legacy settings when BFF disables the shared body UX gate", () => {
    expect(legacyPreferences(new ApiError(503, "BODY_SELECTION_DISABLED", "disabled"))).toBe(true);
  });
  it("does not hide transient errors behind legacy settings", () => {
    for (const status of [409, 500, 503])
      expect(legacyPreferences(new ApiError(status, "TEMPORARY_FAILURE", "retry"))).toBe(false);
    expect(legacyPreferences(new Error("offline"))).toBe(false);
  });
});
