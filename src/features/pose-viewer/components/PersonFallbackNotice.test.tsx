import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PersonFallbackNotice } from "./PersonFallbackNotice";

afterEach(cleanup);

it("explains observed upper-body matching without promising crop or refinement", () => {
  render(<PersonFallbackNotice person={{ fallbackMode: "soft", coverageClass: "upper_only" }} />);
  expect(screen.getByRole("status").textContent).toContain("보이는 어깨와 팔");
  expect(screen.getByRole("status").textContent).toContain("자동 보정은 지원하지 않습니다");
});

it("distinguishes unsupported head matching from a failed body extraction", () => {
  render(
    <PersonFallbackNotice
      compact
      person={{
        fallbackMode: "hard",
        coverageClass: "insufficient",
        candidateShortfallReason: "HEAD_SEARCH_UNSUPPORTED",
      }}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("두상 방향");
});

it("preserves the generic fallback for legacy responses", () => {
  render(<PersonFallbackNotice person={{ fallbackMode: "hard", coverageClass: "insufficient" }} />);
  expect(screen.getByRole("status").textContent).toContain("포즈 후보를 찾지 못했습니다");
});

for (const status of ["ok", "no_result", "error", "partial_error", "blocked", "undetermined"]) {
  it(`shows routed ${status} without legacy success or export promises`, () => {
    render(
      <PersonFallbackNotice
        person={{
          fallbackMode: status === "ok" ? "soft" : "hard",
          coverageClass: "sparse",
          routedSearch: {
            version: "fullbody-dynamic-v1",
            route: "hybrid",
            status,
            reason: null,
            nearCandidateCount: 2,
            framingReferenceCount: 1,
            generationStatus: "preview_ready",
            generatedCandidateCount: 3,
            basicModel: false,
          },
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("기하·의미 통합 검색");
    expect(screen.getByRole("status").textContent).toContain("파일 저장은 지원하지 않습니다");
    expect(screen.getByRole("status").textContent).toContain("근접 참고 2개");
    expect(screen.getByRole("status").textContent).toContain("미리보기 후보 3개");
  });
}
it("basic model never masquerades as a matched library pose", () => {
  render(
    <PersonFallbackNotice
      person={{
        fallbackMode: "hard",
        coverageClass: "insufficient",
        routedSearch: {
          version: "fullbody-dynamic-v1",
          route: "basic_model",
          status: "ok",
          reason: null,
          nearCandidateCount: 0,
          framingReferenceCount: 0,
          generationStatus: null,
          generatedCandidateCount: 0,
          basicModel: true,
        },
      }}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("포즈 검색 결과가 아닙니다");
});
