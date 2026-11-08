import { bodyScopeSchema } from "./outputScope";
import type { PoseCandidate } from "./pose.contract";
import type { PreviewCandidate } from "./posePresentation";

// Keep these inputs identical between the cards and their large preview.
export function candidatePosterOptions(candidate?: PoseCandidate) {
  return {
    url: candidate?.posterUrl,
    scope: candidate?.posterScope,
    source: candidate?.sourceBvhSha256 ?? candidate?.previewModel?.sourceSha,
    fallbackUrl: candidate?.quickThumbnailUrl,
    directional: candidate?.source !== "generation",
  };
}

export function presentationPosterOptions(
  candidate: PreviewCandidate,
  rawScope: string | null | undefined,
  savedOnly: boolean,
) {
  return {
    url: candidate.source === "library" ? candidate.asset.preview_bvh_url + "/poster" : undefined,
    source: candidate.asset.bvh_sha256,
    candidate,
    scope: bodyScopeSchema.safeParse(rawScope).data ?? "full",
    savedOnly,
    directional: candidate.source === "library",
  };
}
