import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { initCaptureShortcut } from "@/features/capture/lib/captureShortcut";
import { initCollapseToBar } from "@/features/bar/lib/collapseListener";
import { router } from "./router";

/** Loginless closed-beta entry point. Installation consent guards all product routes. */
export function App() {
  useEffect(() => {
    void initCaptureShortcut();
    void initCollapseToBar();
  }, []);

  return <RouterProvider router={router} />;
}
