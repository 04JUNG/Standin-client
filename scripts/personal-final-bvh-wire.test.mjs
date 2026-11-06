// @vitest-environment node
/** Opt-in minimal loopback ownership fixture; no native/production-auth claim. */
import { readFile } from "node:fs/promises";
import { it, expect } from "vitest";
import { setInstallationCredentials } from "../src/shared/api/client";
import { toAnalysisResult } from "../src/features/pose-viewer/api/pose.http";
import { finalPose } from "../src/features/personal-body/prepare";
const directory = process.env.STANDIN_PERSONAL_HTTP_FIXTURE;
it.skipIf(!directory)(
  "reads the owned selected final BVH over real HTTP and rejects another owner/selection/source",
  async () => {
    const credentials = JSON.parse(await readFile(directory + "/fixture-private.json", "utf8"));
    const provenance = JSON.parse(await readFile(directory + "/fixture-provenance.json", "utf8"));
    const signal = new AbortController().signal;
    const auth = { installationId: credentials.owner, deviceToken: credentials.token };
    try {
      const response = await fetch(
        "http://localhost:8000/v1/analysis/jobs/" + provenance.jobId + "/result",
        {
          headers: { "X-Installation-Id": auth.installationId, "X-Device-Token": auth.deviceToken },
        },
      );
      expect(response.status).toBe(200);
      const result = await toAnalysisResult(await response.json(), signal);
      const candidate = result.people[0].candidates[0];
      const item = {
        personIndex: 0,
        candidate,
        exportUrl: candidate.bvhUrl,
        refined: false,
        skipped: true,
        previewUrl: "",
      };
      setInstallationCredentials(auth);
      const pose = await finalPose(result.jobId, item, signal);
      expect(pose.hash).toBe(provenance.bvhSha256);
      expect(new TextDecoder().decode(pose.bytes.subarray(0, 9))).toBe("HIERARCHY");
      const second = result.people[0].candidates[1];
      await expect(
        finalPose(result.jobId, { ...item, candidate: second, exportUrl: second.bvhUrl }, signal),
      ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
      await expect(
        finalPose(
          result.jobId,
          { ...item, candidate: { ...candidate, sourceBvhSha256: "f".repeat(64) } },
          signal,
        ),
      ).rejects.toMatchObject({ code: "STALE_RESULT" });
      const confirm = await fetch(
        "http://localhost:8000/v1/analysis/jobs/" + result.jobId + "/selections",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Installation-Id": auth.installationId,
            "X-Device-Token": auth.deviceToken,
          },
          body: JSON.stringify({ selections: [{ personIndex: 0, candidateId: second.id }] }),
        },
      );
      expect(confirm.status).toBe(200);
      expect(
        (
          await finalPose(
            result.jobId,
            { ...item, candidate: second, exportUrl: second.bvhUrl },
            signal,
          )
        ).hash,
      ).toBe(provenance.bvhSha256);
      await expect(finalPose(result.jobId, item, signal)).rejects.toMatchObject({
        code: "INVALID_SELECTION",
      });
      await fetch("http://localhost:8000/v1/analysis/jobs/" + result.jobId + "/selections", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Installation-Id": auth.installationId,
          "X-Device-Token": auth.deviceToken,
        },
        body: JSON.stringify({ selections: [{ personIndex: 0, candidateId: candidate.id }] }),
      });
      setInstallationCredentials({ ...auth, installationId: "another-owner" });
      await expect(finalPose(result.jobId, item, signal)).rejects.toMatchObject({ status: 403 });
    } finally {
      setInstallationCredentials(null);
    }
  },
  30000,
);
