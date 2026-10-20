import { expect, it } from "vitest";
import {
  hasPresentationCandidates,
  presentationNotice,
  presentationGenerationNotice,
} from "./presentationState";
import type { PosePresentation, PreviewCandidate } from "./posePresentation";
const empty = {
  library_candidates: [],
  review_candidates: [],
  generated_candidates: [],
  search_status: "no_result",
  search_reason: null,
  generation_status: "not_requested",
  issues: [],
  preview_status: "unavailable",
} as unknown as PosePresentation;
it("only advertises references when an actual candidate exists", () => {
  expect(hasPresentationCandidates(empty)).toBe(false);
  for (const key of ["library_candidates", "review_candidates", "generated_candidates"] as const)
    expect(hasPresentationCandidates({ ...empty, [key]: [{} as PreviewCandidate] })).toBe(true);
  expect(hasPresentationCandidates(undefined)).toBe(false);
});
it("distinguishes empty search, failed search, failed checks and rejected contracts", () => {
  expect(presentationNotice(empty)).toContain("찾지 못했어요");
  expect(presentationNotice({ ...empty, search_status: "error" })).toContain("검색을 마치지");
  expect(presentationNotice({ ...empty, issues: ["hand_skin_screen_unavailable"] })).toContain(
    "확인을 마치지",
  );
  for (const search_reason of [
    "presentation_contract_invalid",
    "presentation_contract_unsupported",
  ])
    expect(presentationNotice({ ...empty, search_status: "error", search_reason })).toContain(
      "응답을 확인하지",
    );
  expect(presentationGenerationNotice(empty)).toContain("만들지 않았어요");
  expect(presentationNotice({ ...empty, library_candidates: Array(5).fill({}) })).toBeNull();
});
