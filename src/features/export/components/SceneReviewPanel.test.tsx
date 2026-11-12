import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SceneReviewPanel } from "./SceneReviewPanel";
import { sceneReviewFixture } from "../api/scene.fixtures";
it.each([false, true])(
  "verified scene can be confirmed while its preview is pending or failed (%s)",
  (previewFailed) => {
    const confirm = vi.fn();
    render(
      <SceneReviewPanel
        review={{ ...sceneReviewFixture(), previewFailed }}
        confirm={confirm}
        cancel={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("img")).toBeNull();
  },
);

it("shows original, verified selection, server changes and explicit original/cancel actions", () => {
  const original = vi.fn();
  const cancel = vi.fn();
  const review = sceneReviewFixture(1);
  review.summary[0]!.direction = {
    torso_camera_yaw: 45,
    torso_label: null,
    head_label: null,
    head_camera_yaw: null,
    head_relative_yaw: null,
    head_pitch_degrees: null,
  };
  render(
    <SceneReviewPanel
      review={review}
      confirm={vi.fn()}
      original={original}
      cancel={cancel}
      comparison={{
        originalUrl: "/original.png",
        selected: [
          {
            personIndex: 0,
            candidateId: "p0",
            poseId: "old0",
            outputScope: "half",
            image: "/verified.png",
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole("img", { name: "원본 러프" })).toHaveAttribute("src", "/original.png");
  expect(screen.getByRole("img", { name: "인물 1 선택한 포즈" })).toHaveAttribute(
    "src",
    "/verified.png",
  );
  expect(screen.getByText("포즈: 변경됨")).toBeVisible();
  expect(screen.queryByText(/old0|new0|SHA|scene-refinement|scene-review/)).toBeNull();
  expect(screen.getByText(/반신 → 전신/)).toBeVisible();
  expect(screen.getByText(/몸 방향 45°/)).toBeVisible();
  expect(screen.getByText(/보정 전 방향과는 비교하기 어려워요./)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "선택한 포즈 그대로 저장" }));
  expect(original).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(cancel).toHaveBeenCalledOnce();
});
