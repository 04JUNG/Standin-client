import { expect, it } from "vitest";
import binding from "./fixtures/scene-camera-artifact-v1.json";
import wire from "./fixtures/csp-scene-bff-wire.json";
import { validateSceneCamera } from "./sceneCamera";
import { validateSceneManifest } from "./sceneMetadata";

it("preserves the Python camera and only accepts it for the downloaded FBX and source size", () => {
  expect(
    validateSceneCamera(binding, binding.artifact_sha256, { width: 1000, height: 768 }),
  ).toEqual(binding);
  expect(() => validateSceneCamera(binding, "f".repeat(64))).toThrow();
  expect(() =>
    validateSceneCamera(binding, binding.artifact_sha256, { width: 768, height: 1000 }),
  ).toThrow();
});
it("accepts a negotiated available recipe while retaining unavailable old-server metadata", () => {
  const m = structuredClone(wire.examples.full.prepareResponse.manifest);
  const expected = {
    jobId: m.jobId,
    mode: "original-selection" as const,
    sha256: binding.artifact_sha256,
    references: wire.examples.full.prepareRequest.persons,
    detected: [0, 1],
    excluded: [],
    noCandidates: [],
  };
  m.artifact.sha256 = binding.artifact_sha256;
  const camera = {
    version: "scene-camera-v1",
    status: "available",
    reason: null,
    recipe: binding.recipe,
    artifactSha256: binding.artifact_sha256,
    applicationRequired: true,
    automaticApplication: "unsupported",
    cspValidation: "unverified",
  };
  expect(validateSceneManifest({ ...m, camera }, expected).camera.status).toBe("available");
  expect(validateSceneManifest(m, expected).camera.status).toBe("unavailable");
  expect(() =>
    validateSceneManifest(
      { ...m, camera: { ...camera, automaticApplication: "applied" } },
      expected,
    ),
  ).toThrow();
});
