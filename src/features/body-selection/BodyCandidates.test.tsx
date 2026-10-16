import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { BodyChip, BodyExpand } from "./BodyCandidates";
import type { BodyEntry } from "./hooks";

/**
 * #84의 의도(미리보기가 느리거나 실패해도 체형 패널이 사용자를 가두지 않는다)를 새 패널에서 지킨다.
 * 새 UX에는 "확정" 버튼이 없다 — 카드를 누르면 바로 저장되고, 칩의 "포즈"로 언제든 닫는다.
 */
const mutate = vi.hoisted(() => vi.fn());
vi.mock("./hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hooks")>()),
  useBodyControls: () => ({
    options: {
      isError: false,
      isPending: false,
      data: {
        characters: [
          { characterId: "female-base", displayName: "기본형", selectable: true },
          { characterId: "female-muscular", displayName: "근육형", selectable: true },
        ],
      },
    },
    mutation: { mutate, isPending: false, isError: false },
  }),
}));
vi.mock("./preferences", () => ({
  useBodyPreferences: () => ({ data: null }),
  useMyDefault: () => ({
    value: null,
    query: { data: null },
    save: { mutate: vi.fn(), isPending: false, isError: false },
  }),
}));
vi.mock("./LiveBodyView", () => ({
  LiveBodyView: () => createElement("div", null, "내 체형"),
  NeutralImage: () => createElement("span"),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { characters: [] } }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

const person = {
  index: 0,
  fallbackMode: "none",
  candidates: [{ id: "pose-1", poseId: "pose-1", rank: 1 }],
} as PersonResult;
// 다섯 후보 미리보기가 모두 실패한 상태. 체형 선택 자체는 저장돼 있다.
const entry = {
  personIndex: 0,
  ready: false,
  error: new Error("preview timed out"),
  group: undefined,
  retry: vi.fn(),
  selection: {
    schemaVersion: "body-selection.v1",
    personIndex: 0,
    selectionRevision: 3,
    resolutionStatus: "ready",
    resolvedSource: "manual",
    resolvedBody: { characterId: "female-base" },
    recommendation: { status: "available", body: null, reasonCodes: [] },
  },
} as unknown as BodyEntry;

function wrap(node: ReturnType<typeof createElement>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: qc }, node));
}

beforeEach(() => {
  mutate.mockClear();
  useInstallationStore.setState({
    credentials: {
      installationId: "panel-test",
      deviceToken: "test",
      consentVersion: "2026-08-02",
    },
  });
});

it("opens and closes the body panel while all five previews are unavailable", () => {
  wrap(createElement(BodyChip, { job: "job-panel", person, entry }));
  const more = screen.getByRole("button", { name: "체형 더보기" });
  const pose = screen.getByRole("button", { name: "포즈" });
  fireEvent.click(more);
  expect(more).toHaveAttribute("aria-pressed", "true");
  expect(pose).not.toBeDisabled();
  fireEvent.click(pose);
  expect(more).toHaveAttribute("aria-pressed", "false");
});

it("saves a picked body without waiting for the previews", () => {
  wrap(createElement(BodyExpand, { job: "job-panel", person, entry, variant: "app" }));
  const card = screen.getByRole("radio", { name: /근육형/ });
  expect(card).not.toBeDisabled();
  fireEvent.click(card);
  expect(mutate).toHaveBeenCalledWith({ intent: "manual", characterId: "female-muscular" });
});
