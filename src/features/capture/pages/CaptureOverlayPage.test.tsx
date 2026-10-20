import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CaptureOverlayPage } from "./CaptureOverlayPage";
import { useCaptureStore } from "../store/captureStore";

afterEach(() => {
  cleanup();
  useCaptureStore.getState().reset();
});

describe("capture cancellation before selecting", () => {
  it.each(["app", "bar"] as const)(
    "Esc immediately returns to %s and allows another capture",
    (origin) => {
      useCaptureStore.setState({
        origin,
        status: "selecting",
        frame: {
          dataUrl: "data:image/png;base64,x",
          width: 2880,
          height: 1800,
          monitor: { x: 0, y: 0, width: 1440, height: 900 },
        },
      });
      render(
        <MemoryRouter initialEntries={["/app/capture"]}>
          <Routes>
            <Route path="/app/capture" element={<CaptureOverlayPage />} />
            <Route path="*" element={<p>returned</p>} />
          </Routes>
        </MemoryRouter>,
      );
      // Deliberately no pointerdown: cancellation must not depend on dragging.
      fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
      expect(screen.getByText("returned")).toBeInTheDocument();
      expect(useCaptureStore.getState().status).toBe("idle");
      expect(useCaptureStore.getState().frame).toBeNull();
    },
  );
});
