import { act, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReviewModelPreview } from "../components/ReviewModelPreview";
import type { ReviewModel } from "../preview/mountReviewModel";

const calls = vi.hoisted(() => {
  const width = vi.fn(),
    dispose = Object.assign(vi.fn(), { setOutlineWidth: vi.fn() });
  return { width, dispose, mount: vi.fn(async () => dispose) };
});
vi.mock("../preview/mountReviewModel", () => ({ mountReviewModel: calls.mount }));

it("updates only the live width handle while dragging; model replacement and unmount release old handles", async () => {
  const model: ReviewModel = { data: new ArrayBuffer(0), characterId: "male", scope: "full" };
  const status = vi.fn();
  const view = render(<ReviewModelPreview model={model} onStatus={status} outlineWidth={0} />);
  await waitFor(() => expect(status).toHaveBeenCalledWith("ready"));
  view.rerender(<ReviewModelPreview model={model} onStatus={status} outlineWidth={1.2} />);
  expect(calls.mount).toHaveBeenCalledTimes(1);
  expect(calls.dispose.setOutlineWidth).toHaveBeenLastCalledWith(1.2);
  await act(async () => {
    view.rerender(
      <ReviewModelPreview
        model={{ ...model, characterId: "female" }}
        onStatus={status}
        outlineWidth={1.2}
      />,
    );
  });
  expect(calls.dispose).toHaveBeenCalledTimes(1);
  expect(calls.mount).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(calls.dispose).toHaveBeenCalledTimes(2);
});
