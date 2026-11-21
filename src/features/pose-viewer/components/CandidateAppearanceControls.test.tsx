import { beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CandidateAppearanceControls } from "./CandidateAppearanceControls";
import { usePoseSelectionStore as store } from "../store/poseSelectionStore";

beforeEach(() => {
  cleanup();
  store.getState().clearSelection();
});

it("offers every skin for a full-body person", () => {
  render(<CandidateAppearanceControls personIndex={0} scope="full" />);
  for (const name of ["기본", "살색", "가이드선", "근육선"])
    expect(screen.getByRole("button", { name })).toBeEnabled();
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "살색" }));
  expect(store.getState().skinByPerson[0]).toBe("flesh");
});

it.each(["half", "bust", "shoulder_head", "head"] as const)(
  "keeps only the default skin for a %s person and says why",
  (scope) => {
    render(<CandidateAppearanceControls personIndex={0} scope={scope} compact />);
    expect(screen.getByRole("button", { name: "기본" })).toBeEnabled();
    for (const name of ["살색", "가이드선", "근육선"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "전신 포즈에서만 스킨을 쓸 수 있어요.");
    }
    expect(screen.getByRole("note")).toHaveTextContent("전신 포즈에서만 스킨을 쓸 수 있어요.");
    fireEvent.click(screen.getByRole("button", { name: "살색" }));
    expect(store.getState().skinByPerson).toEqual({});
  },
);

it("returns a stale nondefault choice on a cropped person to the plain default skin", () => {
  store.getState().setPersonSkin(0, "flesh-guide");
  render(<CandidateAppearanceControls personIndex={0} scope="half" />);
  // Gray guide lines are unavailable too, so 기본 must not land on gray-guide.
  fireEvent.click(screen.getByRole("button", { name: "기본" }));
  expect(store.getState().skinByPerson).toEqual({});
});
