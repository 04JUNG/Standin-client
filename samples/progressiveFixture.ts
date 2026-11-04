import type { toAnalysisResult } from "@/features/pose-viewer/api/pose.http";
export const jobId = "job_ceb10000-3795-461c-8e17-21e4a8ba65aa";
export const snapshotId = "ce9f82dc-3795-461c-8e17-21e4a8ba65aa";
export const sourceSha = "a".repeat(64);
export function rawPage(
  start: number,
  end: number,
  legacy = false,
): Parameters<typeof toAnalysisResult>[0] {
  const candidates = Array.from({ length: end - start }, (_, i) => {
    const n = start + i,
      id = "preview_" + n.toString(16).padStart(64, "0");
    return {
      id,
      poseId: `sample-${n}`,
      rank: n < 965 ? n + 1 : n - 964,
      view: "front",
      tags: [],
      matchLevel: "medium" as const,
      bvhAvailable: true,
      source: "semantic" as const,
      manualExportAllowed: true,
      lookupAllowed: true,
      refineAllowed: false,
      sourceBvhSha256: sourceSha,
      semantic: {
        familyId: `sample-${n}`,
        alternate: false,
        description: "문장 검색 후보",
        near: n >= 965,
      },
    };
  });
  const previews = candidates.map((c) => ({
    candidate_id: c.id,
    pose_id: c.poseId,
    source: "library",
    kind: c.semantic.near ? "near_match" : "library_match",
    rank: c.rank,
    camera_kind: "front_reference",
    render_camera: {},
    score_kind: "semantic_similarity",
    rank_score: 0.8,
    score_is_accuracy: false,
    asset: {
      transport: "library_bvh",
      bvh_sha256: sourceSha,
      preview_bvh_url: `/v1/analysis/jobs/${jobId}/people/0/pose-previews/${c.id}/${sourceSha}`,
    },
    lookup_allowed: true,
    review_required: true,
    auto_apply_allowed: false,
    refine_allowed: false,
    export_allowed: false,
    release_allowed: false,
    actual_mesh_validated: false,
  }));
  return {
    jobId,
    source: "semantic",
    semantic: {
      query: "두 팔을 벌린 자세",
      index: { version: "sample" },
      ...(!legacy
        ? {
            paging: {
              snapshotId,
              loaded: end,
              total: 1000,
              matches: 965,
              near: 35,
              pageSize: 20,
              nextCursor: end < 1000 ? `${snapshotId}.${end}` : null,
            },
          }
        : {}),
    },
    notes: [],
    capabilities: { refine: false, fbxExport: false, characterSelection: false },
    candidatesByPerson: [
      {
        personIndex: 0,
        box: null,
        tags: {},
        confidence: "low",
        skeletonState: "missing",
        skeletonSource: "none",
        coverageClass: "insufficient",
        fallbackMode: "none",
        refineAllowed: false,
        candidates,
        posePresentation: {
          version: "semantic-pose-presentation-v1",
          person_index: 0,
          route: "semantic_text",
          status: "ready",
          search_status: "ok",
          search_reason: null,
          generation_status: "not_requested",
          generation_reason: null,
          output_scope: "full",
          unobserved_body_is_default: null,
          library_candidates: previews.filter((c) => c.kind === "library_match"),
          review_candidates: previews.filter((c) => c.kind === "near_match"),
          generated_candidates: [],
          basic_model: null,
          issues: [],
          preview_status: "available",
          auto_apply_allowed: false,
          refine_allowed: false,
          export_allowed: false,
        },
      },
    ],
  } as unknown as Parameters<typeof toAnalysisResult>[0];
}
