import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useExportStore } from "@/features/export/store/exportStore";
import { GeneratedFbxNotice } from "./GeneratedFbxNotice";
it("offers explicit FBX final review instead of silently saving a raw generated BVH", () => {
  useExportStore.getState().setFormat("bvh");
  render(<GeneratedFbxNotice />);
  fireEvent.click(screen.getByRole("button", { name: "FBX로 확인하기" }));
  expect(useExportStore.getState().format).toBe("fbx");
});
