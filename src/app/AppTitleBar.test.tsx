import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { isMac } from "@/shared/lib/platform";
import { windowModeService } from "@/features/bar/api/windowMode.service";
import { AppTitleBar } from "./AppTitleBar";

vi.mock("@/shared/lib/platform", () => ({ isMac: vi.fn() }));
vi.mock("@/features/bar/api/windowMode.service", () => ({
  windowModeService: { control: vi.fn() },
}));

it.each([true, false])("keeps all window actions outside the drag region (macOS=%s)", (mac) => {
  vi.mocked(isMac).mockReturnValue(mac);
  vi.mocked(windowModeService.control).mockClear();
  const { container } = render(<AppTitleBar />);
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(3);
  expect(buttons[0]).toHaveAccessibleName(mac ? "닫기" : "플로팅 바로 접기");
  const drag = container.querySelector("[data-tauri-drag-region]")!;
  expect(drag.querySelector("button")).toBeNull();
  expect(drag.compareDocumentPosition(buttons[0]!)).toBe(mac ? 2 : 4);

  for (const [label, action] of [
    ["닫기", "close"],
    ["플로팅 바로 접기", "minimize"],
    ["최대화 / 복원", "toggleMaximize"],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(windowModeService.control).toHaveBeenLastCalledWith(action);
  }
  expect(windowModeService.control).toHaveBeenCalledTimes(3);
});
