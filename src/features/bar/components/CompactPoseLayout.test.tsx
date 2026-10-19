import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompactPoseImage } from "./CompactPoseLayout";

it("opens the same poster only on explicit action, restores focus and closes on Escape", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const src = "data:image/png;base64,AA==";
  render(<CompactPoseImage src={src} alt="3번 기본 포즈" />);
  const enlarge = screen.getByRole("button", { name: "3번 기본 포즈 이미지 확대" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  enlarge.focus();
  fireEvent.click(enlarge);
  expect(screen.getByRole("dialog", { name: "3번 기본 포즈" })).toBeInTheDocument();
  expect(screen.getByAltText("3번 기본 포즈 확대")).toHaveAttribute("src", src);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(enlarge).toHaveFocus();
  fetch.mockRestore();
});

it("source changes close the old enlarged image before it can represent a new candidate", () => {
  const view = render(<CompactPoseImage src="data:image/png;base64,A" alt="후보 A" />);
  fireEvent.click(screen.getByRole("button", { name: "후보 A 이미지 확대" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  view.rerender(<CompactPoseImage src="data:image/png;base64,B" alt="후보 B" />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByAltText("후보 A 확대")).not.toBeInTheDocument();
  view.rerender(<CompactPoseImage src="data:image/png;base64,A" alt="후보 A" />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
