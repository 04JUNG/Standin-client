import { expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateFinalReview } from "./invalidateFinalReview";
import { rememberFramedFormat, reviewedArtifactSha } from "./framedExport";
it("drops this job's final URLs and queries while preserving source, other jobs and choices", () => {
  const client = new QueryClient();
  const url = "/v1/pose-candidates/preview_a/framed?jobId=job_a&format=fbx";
  rememberFramedFormat(url, false, { sourceSha: "a", characterSha: "b", artifactSha256: "c" });
  const image = ["framed-preview", "owner", url],
    body = ["body", "owner", "job_a", 0, "review"];
  const other = ["framed-preview", "owner", url.replace("job_a", "job_b")],
    source = ["pose-source", "job_a"];
  for (const key of [image, body, other, source]) client.setQueryData(key, "data");
  invalidateFinalReview(client, "job_a");
  expect(reviewedArtifactSha(url)).toBeUndefined();
  expect(client.getQueryData(image)).toBeUndefined();
  expect(client.getQueryData(body)).toBeUndefined();
  expect(client.getQueryData(source)).toBe("data");
  expect(client.getQueryData(other)).toBe("data");
  client.clear();
});
