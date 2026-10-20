import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CompactPoseImage } from "./CompactPoseLayout";

it("renders the poster without an enlargement control or dialog", () => {
  const src = "data:image/png;base64,AA==";
  render(<CompactPoseImage src={src} alt="3번 기본 포즈" />);
  fireEvent.click(screen.getByAltText("3번 기본 포즈"));
  expect(screen.getByAltText("3번 기본 포즈")).toHaveAttribute("src", src);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText(/확대/)).toBeNull();
});

it("replaces the poster when the candidate changes", () => {
  const view = render(<CompactPoseImage src="data:image/png;base64,A" alt="후보 A" />);
  view.rerender(<CompactPoseImage src="data:image/png;base64,B" alt="후보 B" />);
  expect(screen.getByAltText("후보 B")).toHaveAttribute("src", "data:image/png;base64,B");
  expect(screen.queryByAltText("후보 A")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
