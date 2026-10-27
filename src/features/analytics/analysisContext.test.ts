import { expect, it } from "vitest";
import { rememberAnalysisFailure, analysisFailureJob } from "./analysisContext";
it("only joins failures with a confirmed server job, never draft IDs or upload failures", () => {
  const error = new Error("private server detail");
  rememberAnalysisFailure(error, "90e1db91-76f2-49c0-9ac5-90bef4095ddc");
  expect(analysisFailureJob(error)).toBeUndefined();
  rememberAnalysisFailure(error, "job_90e1db91-76f2-49c0-9ac5-90bef4095ddc");
  expect(analysisFailureJob(error)).toBe("job_90e1db91-76f2-49c0-9ac5-90bef4095ddc");
  expect(analysisFailureJob(new Error("upload rejected"))).toBeUndefined();
  expect(Object.keys(error)).toEqual([]);
});
