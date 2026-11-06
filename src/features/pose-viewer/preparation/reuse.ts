import { apiFetch } from "@/shared/api/client";
import { VERSION, reuseSchema, usable, type PreparedBatch } from "./contract";
import { preparationPath } from "./http";
import type { RefineOutcome } from "../api/refine.contract";
import type { AnalysisResult } from "../api/pose.contract";
export async function reusePreparedSelection(
  result: AnalysisResult,
  batch: PreparedBatch,
  picks: Record<number, string>,
  signal: AbortSignal,
): Promise<Record<number, RefineOutcome>> {
  const selections = Object.entries(picks).map(([person, candidateId]) => {
    const prepared = batch.candidates.find(
      (c) => c.personIndex === Number(person) && c.candidateId === candidateId,
    );
    if (!prepared || !usable(prepared.status) || !prepared.previewAsset)
      throw Error("prepared selection unavailable");
    return { personIndex: Number(person), candidateId, resultId: prepared.resultId };
  });
  const response = reuseSchema.parse(
    await apiFetch<unknown>(`${preparationPath(result.jobId, batch.batchId)}/reuse`, {
      method: "POST",
      auth: false,
      body: { schemaVersion: VERSION, selections },
      signal,
    }),
  );
  signal.throwIfAborted();
  if (
    response.batchId !== batch.batchId ||
    response.contextHash !== batch.contextHash ||
    response.selections.length !== selections.length ||
    Date.parse(batch.expiresAt) <= Date.now()
  )
    throw Error("prepared context changed");
  const outcomes: Record<number, RefineOutcome> = {};
  for (const selected of selections) {
    const prepared = batch.candidates.find((c) => c.resultId === selected.resultId)!;
    const receipt = response.selections.find(
      (c) =>
        c.personIndex === selected.personIndex &&
        c.candidateId === selected.candidateId &&
        c.resultId === selected.resultId,
    );
    if (
      !receipt ||
      receipt.contextHash !== prepared.contextHash ||
      receipt.outputSha256 !== prepared.outputSha256 ||
      receipt.sourceUrl !== prepared.modelUrl ||
      receipt.sourceReceipt.contextHash !== prepared.contextHash ||
      receipt.refined !== (prepared.status === "ready_refined") ||
      outcomes[selected.personIndex]
    )
      throw Error("prepared receipt mismatch");
    const candidate = result.people
      .find((p) => p.index === selected.personIndex)
      ?.candidates.find((c) => c.id === selected.candidateId);
    if (!candidate?.bvhUrl) throw Error("prepared export unavailable");
    outcomes[selected.personIndex] = {
      jobId: result.jobId,
      personIndex: selected.personIndex,
      candidateId: selected.candidateId,
      refined: prepared.status === "ready_refined",
      reasonCode: prepared.reasonCode,
      adjustedLimbs: [],
      // Existing selected-only target endpoint resolves the prepared source after reuse.
      exportUrl: receipt.exportUrl,
      previewUrl: "",
      prepared: {
        batchId: batch.batchId,
        resultId: prepared.resultId,
        contextHash: prepared.contextHash,
        outputSha256: receipt.outputSha256,
        sourceUrl: receipt.sourceUrl,
        expiresAt: batch.expiresAt,
      },
    };
  }
  return outcomes;
}
