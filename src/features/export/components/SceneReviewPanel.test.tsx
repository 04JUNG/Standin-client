import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SceneReviewPanel } from "./SceneReviewPanel";
import type { SceneReview } from "../api/scene";
it.each([false, true])(
  "verified scene can be confirmed while its preview is pending or failed (%s)",
  (previewFailed) => {
    const confirm = vi.fn();
    render(
      <SceneReviewPanel
        review={{ previewBase64: "", previewFailed } as SceneReview}
        confirm={confirm}
        cancel={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "이 장면 다운로드" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("img")).toBeNull();
  },
);
