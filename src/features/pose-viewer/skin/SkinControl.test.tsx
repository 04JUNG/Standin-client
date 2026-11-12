import { beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { SkinControl } from "./SkinControl";
import { SKIN_CHOICES } from "./skinChoices";
import { usePoseSelectionStore as store } from "../store/poseSelectionStore";
beforeEach(() => {
  cleanup();
  store.getState().clearSelection();
});
const all = SKIN_CHOICES.map((s) => s.id);
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
it("keeps flesh while switching mutually exclusive lines and toggles a line off", () => {
  render(<SkinControl personIndex={1} available={all} />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "기본",
    "살색",
    "가이드선",
    "근육선",
  ]);
  click("살색");
  click("근육선");
  expect(store.getState().skinByPerson[1]).toBe("flesh-muscle");
  expect(screen.getByRole("button", { name: "살색" })).toHaveAttribute("aria-pressed", "true");
  click("가이드선");
  expect(store.getState().skinByPerson[1]).toBe("flesh-guide");
  expect(screen.getByRole("button", { name: "근육선" })).toHaveAttribute("aria-pressed", "false");
  click("가이드선");
  expect(store.getState().skinByPerson[1]).toBe("flesh");
  click("근육선");
  click("근육선");
  expect(store.getState().skinByPerson[1]).toBe("flesh");
});
it("preserves lines when changing base and shares the result with the final preview controls", () => {
  render(
    <>
      <SkinControl personIndex={0} available={all} />
      <SkinControl personIndex={0} available={all} />
    </>,
  );
  const [large, final] = screen.getAllByRole("group");
  fireEvent.click(within(large).getByRole("button", { name: "근육선" }));
  fireEvent.click(within(large).getByRole("button", { name: "살색" }));
  expect(store.getState().skinByPerson[0]).toBe("flesh-muscle");
  expect(within(final).getByRole("button", { name: "살색" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(within(final).getByRole("button", { name: "기본" }));
  expect(store.getState().skinByPerson[0]).toBe("muscle");
});
it("disables unavailable combinations and still allows clearing a stale line choice", () => {
  store.getState().setPersonSkin(0, "muscle");
  render(<SkinControl personIndex={0} available={[]} />);
  expect(screen.getByRole("button", { name: "살색" })).toBeDisabled();
  click("근육선");
  expect(store.getState().skinByPerson).toEqual({});
});
