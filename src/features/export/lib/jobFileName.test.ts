import { expect, it } from "vitest";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import type { UploadDraft } from "@/shared/types/upload";
import { jobFileName } from "./jobFileName";
it("history T001 never reuses p0718 draft name; missing names use only job identity", () => {
  const draft = { id: "p0718", originalName: "S3-v3_rough_0718.png" } as UploadDraft;
  const result = {
    jobId: "job_T001",
    sourceImage: { identity: "job_T001:input", originalName: "T001.png" },
  } as AnalysisResult;
  expect(jobFileName("job_T001", result, draft, "fbx")).toBe("T001_standin_pose.fbx");
  expect(jobFileName("job_T001", { ...result, sourceImage: undefined }, draft, "fbx")).toBe(
    "standin_job_T001_standin_pose.fbx",
  );
  expect(
    jobFileName(
      "job_T001",
      { ...result, sourceImage: { ...result.sourceImage!, identity: "job_p0718:input" } },
      draft,
      "fbx",
    ),
  ).not.toContain("0718");
});
