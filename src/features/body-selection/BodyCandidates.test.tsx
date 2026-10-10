import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { BodyCandidates } from "./BodyCandidates";
import type { BodyEntry } from "./hooks";

vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { characters: [] } }),
}));
vi.mock("@/features/pose-viewer/components/PoseCandidateCard", () => ({
  PoseCandidateCard: ({ bodyPreview }: { bodyPreview: { pending: boolean } }) =>
    createElement("button", { "data-pose-candidate": true, disabled: bodyPreview.pending }, "포즈"),
}));

beforeEach(() => {
  useInstallationStore.setState({
    credentials: { installationId: "panel-test", deviceToken: "test", consentVersion: "2026-08-02" },
  });
});

it("can confirm or close a saved body while all five previews are unavailable", () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const person = {
    index: 0,
    fallbackMode: "none",
    candidates: [{ id: "pose-1", poseId: "pose-1", rank: 1 }],
  } as PersonResult;
  const entry = {
    personIndex: 0,
    ready: false,
    error: new Error("preview timed out"),
    group: undefined,
    retry: vi.fn(),
    selection: {
      schemaVersion: "body-selection.v1",
      personIndex: 0,
      resolutionStatus: "ready",
      resolvedSource: "manual",
      resolvedBody: { characterId: "body-female-muscular" },
      recommendation: { status: "available", body: null, reasonCodes: [] },
    },
  } as unknown as BodyEntry;
  render(
    createElement(QueryClientProvider, { client: qc },
      createElement(BodyCandidates, { job: "job-panel", person, entry, onSelect: vi.fn() })),
  );
  fireEvent.click(screen.getByRole("button", { name: "체형 더보기" }));
  const confirm = screen.getByRole("button", { name: "이 체형으로 확정" });
  expect(confirm).not.toBeDisabled();
  fireEvent.click(confirm);
  expect(screen.queryByRole("region", { name: "인물 1 체형 선택" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "체형 더보기" }));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.queryByRole("region", { name: "인물 1 체형 선택" })).not.toBeInTheDocument();
});
