import { validReferenceSource } from "./humanReference";
import type { PoseCandidate } from "./pose.contract";
import type { PreviewCandidate } from "./posePresentation";

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
