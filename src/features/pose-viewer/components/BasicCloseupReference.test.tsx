import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BasicCloseupReference } from "./BasicCloseupReference";
import type { PosePresentation } from "../api/posePresentation";
import { useInstallationStore } from "@/features/installation/installationStore";
const load = vi.hoisted(() => vi.fn());
vi.mock("../api/basicCloseup", () => ({ loadBasicCloseup: load }));
const p = {
  output_scope: "shoulder_head",
  basic_model: { status: "planned", output_scope: "shoulder_head" },
} as PosePresentation;
afterEach(() => {
  load.mockReset();
  useInstallationStore.setState({ credentials: null });
});
function show(compact = false) {
  useInstallationStore.setState({
    credentials: {
      installationId: "test-owner",
      deviceToken: "test-token",
      consentVersion: "fixture",
    },
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <BasicCloseupReference presentation={p} compact={compact} />
    </QueryClientProvider>,
  );
}
it.each([false, true])(
  "shows the decoded reference without a selection button (compact=%s)",
  async (compact) => {
    load.mockResolvedValue("data:image/png;base64,AA==");
    show(compact);
    expect(await screen.findByAltText("기본 체형의 클로즈업 참고 모델")).toBeTruthy();
    expect(screen.getByText(/중립 자세 참고/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /선택|저장/ })).toBeNull();
  },
);
it("reports failure, retries, and never claims an empty search", async () => {
  load
    .mockRejectedValueOnce(Error("WebGL unavailable"))
    .mockResolvedValue("data:image/png;base64,AA==");
  show();
  const retry = await screen.findByRole("button", { name: "다시 시도" });
  expect(screen.queryByText("후보 없음")).toBeNull();
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getByAltText("기본 체형의 클로즈업 참고 모델")).toBeTruthy());
  expect(load).toHaveBeenCalledTimes(2);
});
