import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReviewPosePreview } from "./ReviewPosePreview";
import type { ReviewModel } from "../preview/mountReviewModel";

const renderer = vi.hoisted(() => ({ status: vi.fn<(status: "ready" | "failed") => void>() }));
vi.mock("./ReviewModelPreview", () => ({
  ReviewModelPreview: ({
    onStatus,
    label,
  }: {
    onStatus: typeof renderer.status;
    label: string;
  }) => {
    renderer.status = onStatus;
    return <canvas role="img" aria-label={label} />;
  },
}));
const props = { label: "저장할 포즈", loading: true, error: false, onModelStatus: vi.fn() };

it("shows progress in the picture while the server has not provided an image", () => {
  render(<ReviewPosePreview {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("저장할 포즈 불러오는 중");
  expect(screen.queryByRole("img")).toBeNull();
});

it("keeps progress until image load and resets for a different body/hand preview", () => {
  const { rerender } = render(<ReviewPosePreview {...props} src="/first.png" />);
  fireEvent.load(screen.getByRole("img"));
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<ReviewPosePreview {...props} src="/second.png" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.load(screen.getByRole("img"));
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows a failure icon rather than spinning forever or leaving a broken image", () => {
  const { rerender } = render(<ReviewPosePreview {...props} src="/broken.png" />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("img", { name: /불러오지 못했어요/ })).toBeInTheDocument();
  rerender(<ReviewPosePreview {...props} loading={false} error />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("waits for model rendering and resets when the model changes", () => {
  const model = {} as ReviewModel;
  const callback = vi.fn();
  const { rerender } = render(
    <ReviewPosePreview {...props} model={model} onModelStatus={callback} />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => renderer.status("ready"));
  expect(callback).toHaveBeenCalledWith("ready");
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<ReviewPosePreview {...props} model={{} as ReviewModel} onModelStatus={callback} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => renderer.status("failed"));
  expect(callback).toHaveBeenCalledWith("failed");
  expect(screen.queryByRole("status")).toBeNull();
});
