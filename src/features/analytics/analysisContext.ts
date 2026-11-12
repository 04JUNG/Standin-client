// Error identity is local-only. Never send the draft route ID as a server job ID.
const failedJobs = new WeakMap<object, string>();
export function rememberAnalysisFailure(error: unknown, jobId: string | undefined) {
  if (error && typeof error === "object" && jobId && /^job_[0-9a-f-]{36}$/i.test(jobId))
    failedJobs.set(error, jobId);
}
export function analysisFailureJob(error: unknown): string | undefined {
  return error && typeof error === "object" ? failedJobs.get(error) : undefined;
}
