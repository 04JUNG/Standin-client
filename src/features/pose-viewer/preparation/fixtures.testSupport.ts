import type { PreparedBatch } from "./contract";
export const sourceHash = "a".repeat(64),
  outputHash = "b".repeat(64),
  contextHash = "c".repeat(64);
export function batchFixture(people = 1): PreparedBatch {
  const candidates = Array.from({ length: people * 5 }, (_, i) => ({
    personIndex: Math.floor(i / 5),
    candidateId: `candidate-${i}`,
    resultId: `result-${i}`,
    contextHash,
    status: "ready_refined" as const,
    reasonCode: "accepted",
    qualityScope: "source_only" as const,
    sourceSha256: sourceHash,
    outputSha256: outputHash,
    modelUrl: `/v1/analysis/jobs/job_test/candidate-preparation/batch-1/people/${Math.floor(i / 5)}/candidates/candidate-${i}/model`,
    previewAsset: {
      schemaVersion: "candidate-source-preview-v1" as const,
      format: "bvh" as const,
      url: `/v1/analysis/jobs/job_test/candidate-preparation/batch-1/people/${Math.floor(i / 5)}/candidates/candidate-${i}/model`,
      sha256: outputHash,
      bytes: 100,
      contextHash,
      sourceSha256: sourceHash,
      displayOnly: true as const,
    },
    validationReceipt: {
      schema: "candidate-source-receipt-v1" as const,
      contextHash,
      sourceFingerprint: sourceHash,
      contextFingerprint: contextHash,
      qualityScope: "source_only" as const,
      skinSafe: false as const,
      finalFileVerified: false as const,
    },
  }));
  return {
    schemaVersion: "standin.candidate-preparation.v1",
    batchId: "batch-1",
    revision: 1,
    contextHash,
    candidateSetRevision: "set-1",
    eventSequence: 1,
    status: "completed",
    terminal: candidates.length,
    total: candidates.length,
    top5Ready: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    candidates,
  };
}
export const identities = (batch: PreparedBatch) =>
  batch.candidates.map(({ personIndex, candidateId, sourceSha256 }) => ({
    personIndex,
    candidateId,
    sourceSha256,
  }));
