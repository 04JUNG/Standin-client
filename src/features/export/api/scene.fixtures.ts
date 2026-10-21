import type { SceneReview, SceneSaveContract } from "./scene";

/** Local contract fixtures only; never a Staging or installed-app result. */
export const sceneContractFixture: SceneSaveContract = {
  version: "scene-save-v1",
  saveModes: ["original-selection", "auto-correct-v4"],
  reviewVersion: "scene-review-v1",
  reviewTtlSeconds: 900,
  cancellation: { httpRequest: true, serverOperation: false },
};
export function sceneReviewFixture(count = 2): SceneReview {
  return {
    contractVersion: "scene-save-v1",
    saveMode: "auto-correct-v4",
    reviewVersion: "scene-review-v1",
    version: "scene-refinement-v4",
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    artifactContract: "verified-scene-fbx-v1",
    reviewKey: "a".repeat(48),
    artifactSha256: "b".repeat(64),
    previewSha256: "",
    previewBase64: "",
    personCount: count,
    fileCount: 1,
    summary: Array.from({ length: count }, (_, personIndex) => ({
      personIndex,
      previousPoseId: `old${personIndex}`,
      poseId: `new${personIndex}`,
      previousOutputScope: "half",
      outputScope: "full",
      poseChanged: true,
      outputScopeChanged: true,
      previousDirection: null,
      directionChanged: null,
      direction: null,
      interaction: null,
      armGoalCount: null,
    })),
  };
}
