import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import wire from "./fixtures/csp-scene-bff-wire.json";
import { apiFetchResponse } from "@/shared/api/client";
import {
  prepareOriginalScene,
  validateSceneManifest,
  sceneAvailabilitySchema,
} from "./sceneMetadata";
import { downloadScene } from "./scene";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(wire.examples.full.prepareResponse.expiresAt).getTime() - 60000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
for (const [name, example] of Object.entries(wire.examples)) {
  it(`consumes actual BFF ${name} prepare/release, matching snapshot and preserving unsupported camera`, async () => {
    vi.setSystemTime(new Date(example.prepareResponse.expiresAt).getTime() - 60000);
    const m = example.prepareResponse.manifest;
    const excluded = m.people.missing
      .filter((x) => x.reason === "user_excluded")
      .map((x) => x.personIndex);
    vi.mocked(apiFetchResponse).mockResolvedValueOnce(
      new Response(JSON.stringify(example.prepareResponse), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const refs = example.prepareRequest.persons;
    const prepared = await prepareOriginalScene(
      m.jobId,
      refs,
      excluded,
      new AbortController().signal,
    );
    const validated = validateSceneManifest(prepared.manifest, {
      jobId: m.jobId,
      mode: "original-selection",
      sha256: prepared.artifactSha256,
      references: refs,
      detected: m.people.detectedIds,
      excluded,
      noCandidates: name === "no_candidates" ? [1] : [],
    });
    expect(validated.camera.automaticApplication).toBe("unsupported");
    expect(sceneAvailabilitySchema.parse(example.capabilities).selectionValidation).toBe(
      "required_on_prepare",
    );
    const response = example.releaseResponse;
    const data = Uint8Array.from(atob(response.bodyBase64), (c) => c.charCodeAt(0));
    vi.mocked(apiFetchResponse).mockResolvedValueOnce(
      new Response(data, { headers: response.headers }),
    );
    expect(await downloadScene(m.jobId, refs, prepared, { negotiated: true })).toEqual(data);
    const body = vi.mocked(apiFetchResponse).mock.calls[1][1]?.body;
    expect(body).toMatchObject({ ...example.releaseRequest, excludedPersonIds: excluded });
  });
}
it.each(["job", "source", "count", "missing", "artifact", "camera", "mapping"])(
  "rejects %s metadata mismatch before persistence",
  (field) => {
    const e = wire.examples.full,
      m = structuredClone(e.prepareResponse.manifest);
    const invalid: unknown =
      field === "job"
        ? { ...m, jobId: "other" }
        : field === "source"
          ? { ...m, sourceImage: { ...m.sourceImage, identity: "other:input" } }
          : field === "count"
            ? { ...m, people: { ...m.people, includedIds: [0] } }
            : field === "missing"
              ? {
                  ...m,
                  people: { ...m.people, missing: [{ personIndex: 1, reason: "no_candidates" }] },
                }
              : field === "artifact"
                ? { ...m, artifact: { ...m.artifact, sha256: "c".repeat(64) } }
                : field === "camera"
                  ? { ...m, camera: { ...m.camera, automaticApplication: "applied" } }
                  : {
                      ...m,
                      sourceImage: {
                        ...m.sourceImage,
                        captureMapping: { status: "available", rect: [0, 0, 100, 100] },
                      },
                    };
    expect(() =>
      validateSceneManifest(invalid, {
        jobId: m.jobId,
        mode: "original-selection",
        sha256: m.artifact.sha256,
        references: e.prepareRequest.persons,
        detected: [0, 1],
        excluded: [],
        noCandidates: [],
      }),
    ).toThrow();
  },
);
it.each([
  "x-standin-scene-snapshot-sha256",
  "x-standin-scene-manifest-version",
  "x-standin-file-count",
])("rejects missing %s binary headers", async (header) => {
  const e = wire.examples.full,
    headers = { ...e.releaseResponse.headers };
  delete headers[header as keyof typeof headers];
  vi.mocked(apiFetchResponse).mockResolvedValue(
    new Response(
      Uint8Array.from(atob(e.releaseResponse.bodyBase64), (c) => c.charCodeAt(0)),
      { headers },
    ),
  );
  await expect(
    downloadScene(e.prepareResponse.manifest.jobId, e.prepareRequest.persons, {
      ...e.prepareResponse,
      saveMode: "original-selection",
      contractVersion: "scene-save-v1",
      reviewVersion: "scene-review-v1",
      fileCount: 1,
      version: "rough-layout-v1",
      manifest: validateSceneManifest(e.prepareResponse.manifest, {
        jobId: e.prepareResponse.manifest.jobId,
        mode: "original-selection",
        sha256: e.prepareResponse.artifactSha256,
        references: e.prepareRequest.persons,
        detected: [0, 1],
        excluded: [],
        noCandidates: [],
      }),
    }),
  ).rejects.toMatchObject({ code: "SCENE_INTEGRITY" });
});
