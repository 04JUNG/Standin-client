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
  expect(presentationNotice({ ...empty, search_status: "error" })).toBe(
    "포즈를 불러오지 못했어요. 다시 시도해 주세요.",
  );
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

it.each(["error", "partial_error", "failed", "timeout"])(
  "keeps remaining candidates separate from a total %s search failure",
  (search_status) => {
    for (const key of [
      "library_candidates",
      "review_candidates",
      "generated_candidates",
    ] as const) {
      const partial = { ...empty, search_status, [key]: [{} as PreviewCandidate] };
      expect(presentationNotice(partial)).toBe("일부 후보를 불러오지 못했어요.");
      expect(presentationNotice({ ...empty, search_status })).toBe(
        "포즈를 불러오지 못했어요. 다시 시도해 주세요.",
      );
    }
  },
);

it("shows check failures at their own stage without rejecting remaining candidates", () => {
  const partial = {
    ...empty,
    search_status: "partial_error",
    search_reason: "hand_skin_screen_unavailable_no_generation",
    library_candidates: [{} as PreviewCandidate],
  };
  expect(presentationNotice(partial)).toBe("일부 포즈의 확인을 마치지 못했어요.");
  expect(
    presentationNotice({ ...partial, search_reason: null, issues: ["validation_failed"] }),
  ).toBe("일부 포즈의 확인을 마치지 못했어요.");
  expect(presentationNotice({ ...partial, library_candidates: [] })).toContain(
    "포즈 확인을 마치지 못했어요",
  );
  expect(
    presentationNotice({ ...partial, search_reason: "presentation_contract_invalid" }),
  ).toContain("앱을 업데이트");
});

it("does not describe a successful empty search as a request failure", () => {
  expect(presentationNotice(empty)).toBe("비슷한 포즈를 찾지 못했어요.");
});
