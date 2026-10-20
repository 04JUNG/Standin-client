import type { PoseCandidate } from "./pose.contract";

export interface RoutedSearch {
  version: string;
  route: string;
  status: string;
  reason: string | null;
  nearCandidateCount: number;
  framingReferenceCount: number;
  generationStatus: string | null;
  generatedCandidateCount: number;
  basicModel: boolean;
}
export interface CandidatePolicy {
  source?: "dynamic" | "semantic" | "library" | "generation";
  sourceBvhSha256?: string;
  rankScore?: number;
  lookupAllowed?: boolean;
  refineAllowed?: boolean;
  releaseAllowed?: boolean;
  /** User-confirmed use of this exact asset, independent of automatic match validation. */
  manualExportAllowed?: boolean;
  presentationKind?: string;
  actualMeshValidated?: boolean;
  reviewRequired?: boolean;
  notExactMatch?: boolean;
  searchCamera?: { yaw?: number; pitch?: number; distance?: number | null; view?: string };
}
export function reviewOnly(candidate: CandidatePolicy | undefined): boolean {
  return (
    candidate?.source === "generation" ||
    candidate?.source === "dynamic" ||
    candidate?.source === "semantic" ||
    (candidate?.source === "library" &&
      (candidate.releaseAllowed !== true ||
        candidate.lookupAllowed !== true ||
        !/^[a-f0-9]{64}$/.test(candidate.sourceBvhSha256 ?? ""))) ||
    candidate?.releaseAllowed === false
  );
}
export function canRelease(candidate: PoseCandidate | undefined): boolean {
  return (
    !!candidate &&
    (!reviewOnly(candidate) ||
      (candidate.manualExportAllowed === true &&
        (candidate.source === "library" ||
          candidate.source === "semantic" ||
          candidate.source === "generation") &&
        candidate.lookupAllowed === true &&
        candidate.bvhAvailable === true &&
        /^[a-f0-9]{64}$/.test(candidate.sourceBvhSha256 ?? "")))
  );
}

/** Only server policy fields; unknown source values must never enable legacy export. */
export function readCandidatePolicy(raw: CandidatePolicy): CandidatePolicy {
  if (
    raw.source === "library" &&
    raw.lookupAllowed === true &&
    raw.releaseAllowed === true &&
    /^[a-f0-9]{64}$/.test(raw.sourceBvhSha256 ?? "")
  )
    return {
      source: "library",
      sourceBvhSha256: raw.sourceBvhSha256,
      lookupAllowed: true,
      releaseAllowed: true,
      refineAllowed: false,
      reviewRequired: true,
      actualMeshValidated: false,
    };
  if (
    (raw.source === "library" || raw.source === "semantic" || raw.source === "generation") &&
    raw.manualExportAllowed === true &&
    raw.lookupAllowed === true &&
    /^[a-f0-9]{64}$/.test(raw.sourceBvhSha256 ?? "")
  )
    return {
      ...raw,
      source: raw.source,
      manualExportAllowed: true,
      releaseAllowed: false,
      refineAllowed: false,
      reviewRequired: true,
      actualMeshValidated: false,
    };
  const restricted = raw.source !== undefined || raw.releaseAllowed === false;
  if (!restricted) return {};
  return {
    source: raw.source === "semantic" ? "semantic" : "dynamic",
    rankScore:
      typeof raw.rankScore === "number" && Number.isFinite(raw.rankScore)
        ? raw.rankScore
        : undefined,
    lookupAllowed: raw.lookupAllowed === true,
    refineAllowed: false,
    releaseAllowed: false,
    actualMeshValidated: false,
    reviewRequired: true,
    notExactMatch: raw.notExactMatch === true,
    searchCamera: raw.searchCamera,
  };
}
