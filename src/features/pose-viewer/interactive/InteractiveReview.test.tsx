import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InteractiveReview } from "./InteractiveReview";
import type { ModelResult } from "./http";
import { prepareSurface } from "./solved";
vi.mock("./InteractivePose", () => ({ ExpandablePose: () => <div>포즈</div> }));
vi.mock("./solved", () => ({
  prepareSurface: vi.fn(() => ({ body: {}, release: vi.fn() })),
  solvedCamera: vi.fn(() => ({})),
}));
it("releases every prepared surface across StrictMode, notice updates and unmount", () => {
  const model = {
    frame: {},
    state: { model: {}, identity: { selection: { candidate: "fixture" } } },
  } as ModelResult;
  const data = { model, viewKey: "fixture", notice: "파일 준비 중", failed: false };
  const view = render(
    <StrictMode>
      <InteractiveReview data={data} />
    </StrictMode>,
  );
  const count = vi.mocked(prepareSurface).mock.calls.length;
  view.rerender(
    <StrictMode>
      <InteractiveReview data={{ ...data, notice: "" }} />
    </StrictMode>,
  );
  expect(prepareSurface).toHaveBeenCalledTimes(count);
  view.unmount();
  for (const result of vi.mocked(prepareSurface).mock.results)
    expect(result.value.release).toHaveBeenCalledOnce();
});
