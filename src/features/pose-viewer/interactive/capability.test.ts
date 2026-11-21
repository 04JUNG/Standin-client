import { describe, expect, it } from "vitest";
import { canUseInteractiveOperations, interactiveStateCapabilitySchema } from "./capability";
import type { AnalysisResult } from "../api/pose.contract";
describe("final operation capability", () => {
  it("never requires a Top5 static asset capability", () => {
    const interactiveState = interactiveStateCapabilitySchema.parse({
      schemaVersion: "standin.interactive-http.v1",
      available: true,
      transport: "polling",
      localHands: false,
      initialFbxRequired: true,
    });
    expect(
      canUseInteractiveOperations({ interactiveState } as AnalysisResult["capabilities"]),
    ).toBe(true);
    expect(
      canUseInteractiveOperations({
        interactiveState: { ...interactiveState, available: false },
      } as AnalysisResult["capabilities"]),
    ).toBe(false);
    expect(canUseInteractiveOperations()).toBe(false);
  });
  it("retains the old negotiated operation capability", () => {
    expect(
      canUseInteractiveOperations({
        interactivePreview: {
          schemaVersion: "interactive-preview-capability-v1",
          top5: true,
          operations: true,
        },
      } as AnalysisResult["capabilities"]),
    ).toBe(true);
  });
  it("rejects unsupported or incomplete private protocol descriptions", () => {
    expect(interactiveStateCapabilitySchema.safeParse({ available: true }).success).toBe(false);
    expect(
      interactiveStateCapabilitySchema.safeParse({
        schemaVersion: "standin.interactive-http.v2",
        available: true,
        transport: "polling",
        localHands: false,
        initialFbxRequired: true,
      }).success,
    ).toBe(false);
  });
});
