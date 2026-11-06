import { beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { SkinControl } from "./SkinControl";
import { SKIN_CHOICES } from "./skinChoices";
import { usePoseSelectionStore as store } from "../store/poseSelectionStore";
beforeEach(() => {
  cleanup();
  store.getState().clearSelection();
});
it("offers the existing five named skins and stores a supported per-person choice", () => {
  render(<SkinControl personIndex={1} available={SKIN_CHOICES.map((s) => s.id)} />);
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
    "기본",
    "회색 가이드",
    "살색",
    "살색 가이드",
    "근육선",
  ]);
  fireEvent.change(screen.getByRole("combobox", { name: "인물 2 스킨" }), {
    target: { value: "flesh-guide" },
  });
  expect(store.getState().skinByPerson).toEqual({ 1: "flesh-guide" });
});
it("does not select an unsupported skin and always permits returning to default", () => {
  store.getState().setPersonSkin(0, "muscle");
  render(<SkinControl personIndex={0} available={[]} />);
  expect(screen.getByRole("option", { name: "살색" })).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "flesh" } });
  expect(store.getState().skinByPerson[0]).toBe("muscle");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "default" } });
  expect(store.getState().skinByPerson).toEqual({});
});
