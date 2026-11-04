import { expect, it } from "vitest";
import { auditCoverage } from "./coverage";
it("does not count an unversioned, wrong-scope or source-only record as actual model coverage", () => {
  const entry = {
    sourceSha256: "a".repeat(64),
    characterSha256: "b".repeat(64),
    revision: "v1",
    scope: "half",
  };
  const report = auditCoverage(
    [entry],
    [
      { ...entry, scope: "full" },
      { ...entry, version: "posed-mesh-v1" },
    ],
  );
  expect(report).toEqual({
    expected: 1,
    covered: 0,
    missing: [entry],
    rejected: 2,
    bytesVerified: false,
  });
});
