import { validReferenceSource } from "./humanReference";
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

export function candidateReferenceUrl(candidate?: PoseCandidate, presentation?: PreviewCandidate) {
  const owned = presentation?.asset.preview_bvh_url;
  if (owned && validReferenceSource(owned, true)) return owned;
  const poster = candidate?.posterUrl;
  if (!poster) return undefined;
  const fromOwned = poster.slice(0, -"/poster".length);
  if (poster.endsWith("/poster") && validReferenceSource(fromOwned, true)) return fromOwned;
  const source = poster.replace(/\/poster\?/, "/poster-source?");
  return validReferenceSource(source, false) ? source : undefined;
}
