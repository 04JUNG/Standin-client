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
