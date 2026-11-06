import { z } from "zod";
import { apiFetchResponse } from "@/shared/api/client";
import type { BodySelection } from "@/features/body-selection/contract";
import type { PoseCandidate } from "../api/pose.contract";
import { boundedBytes } from "./assets";
import { loadSolvedPacket, prepareSurface, solvedCamera } from "./solved";
const envelope = z
  .object({
    schemaVersion: z.literal("standin.selection-preview.v1"),
    previewOnly: z.literal(true),
    bodyRevision: z.number().int().nonnegative(),
    packet: z
      .object({
        operation: z.string(),
        revision: z.number().int().positive(),
        stateHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .passthrough(),
  })
  .strict();
/** Same canonical decoder/camera as final review; this request never confirms or exports. */
export async function loadSelectionPacket(
  job: string,
  selection: BodySelection,
  candidate: PoseCandidate,
  scope: string,
  signal: AbortSignal,
) {
  const response = await apiFetchResponse(
    `/v1/analysis/jobs/${encodeURIComponent(job)}/people/${selection.personIndex}/selection-preview`,
    {
      auth: false,
      method: "POST",
      body: { candidateId: candidate.id, bodyRevision: selection.selectionRevision },
      signal,
    },
  );
  const raw = envelope.parse(
    JSON.parse(new TextDecoder().decode(await boundedBytes(response, 64 * 1024 * 1024, signal))),
  );
  if (raw.bodyRevision !== selection.selectionRevision) throw Error("body revision changed");
  const model = await loadSolvedPacket(raw.packet, {
    operationId: raw.packet.operation,
    revision: raw.packet.revision,
    stateHash: raw.packet.stateHash,
    personIndex: selection.personIndex,
    candidateId: candidate.id,
  });
  const i = model.state.identity;
  if (
    i.body.characterId !== selection.resolvedBody?.characterId ||
    i.body.characterSha256 !== selection.resolvedBody.assetSha256 ||
    i.shape.sha256 !== (selection.shape?.shapeSha256 ?? null) ||
    i.source.originalBvhSha256 !== candidate.sourceBvhSha256 ||
    i.scope !== scope ||
    i.solver.adapterVersion !== "post-frozen-file-canonical-snapshot-v2"
  )
    throw Error("selected model changed");
  signal.throwIfAborted();
  const camera = solvedCamera(model.state, {
    target: [0, 0, 0],
    referenceAspect: 1,
    projectionIncludesCenterScaleCrop: true,
  });
  return { ...prepareSurface(model.state.model), camera };
}
