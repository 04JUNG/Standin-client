import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { BodyChip, BodyExpand } from "./BodyCandidates";
import type { BodyEntry } from "./hooks";
import type { BodyPreferences, ShapeSpec } from "./contract";

/**
 * #84의 의도(미리보기가 느리거나 실패해도 체형 패널이 사용자를 가두지 않는다)를 새 패널에서 지킨다.
 * 새 UX에는 "확정" 버튼이 없다 — 카드를 누르면 바로 저장되고, 칩의 "포즈"로 언제든 닫는다.
 */
const mutate = vi.hoisted(() => vi.fn());
const prefs = vi.hoisted(() => ({ current: null as BodyPreferences | null }));
const spec: ShapeSpec = {
  schemaVersion: "body-shape.v1",
  controls: [
    { key: "height", min: 150, max: 190, step: 1, default: 175 },
    { key: "muscle", min: 0, max: 4, step: 0.05, default: 0 },
  ],
};
vi.mock("./hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hooks")>()),
  useBodyControls: () => ({
    options: {
      isError: false,
      isPending: false,
      data: {
        characters: [
          { characterId: "female-base", displayName: "기본형", selectable: true, shape: spec },
          { characterId: "female-muscular", displayName: "근육형", selectable: true },
        ],
      },
    },
    mutation: { mutate, isPending: false, isError: false },
  }),
}));
vi.mock("./preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./preferences")>()),
  useBodyPreferences: () => ({ data: prefs.current }),
}));
vi.mock("./LiveBodyView", () => ({
  LiveBodyView: () => createElement("div", null, "내 체형"),
  NeutralImage: () => createElement("span"),
  ShapeThumb: () => createElement("span"),
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
const withCard = (): BodyPreferences => ({
  version: "body-preferences.v1",
  scope: "installation",
  mode: "last_used",
  cards: [
    {
      cardId: "card_1",
      name: "주인공 A",
      characterId: "female-base",
      controls: { height: 168, muscle: 1 },
      createdAt: "",
      updatedAt: "",
    },
  ],
  revision: 1,
});

function wrap(node: ReturnType<typeof createElement>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: qc }, node));
}

beforeEach(() => {
  mutate.mockClear();
  prefs.current = null;
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

it("applies a saved body card (body and numbers at once) and has no 'my default' buttons", () => {
  prefs.current = withCard();
  wrap(createElement(BodyExpand, { job: "job-panel", person, entry, variant: "app" }));
  expect(screen.queryByRole("button", { name: /내 기본값/ })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "내 체형 주인공 A" }));
  expect(mutate).toHaveBeenCalledWith({
    intent: "manual",
    characterId: "female-base",
    shape: { controls: { height: 168, muscle: 1 } },
  });
});

it("names the person's body after the card it matches", () => {
  prefs.current = withCard();
  const shaped = {
    ...entry,
    selection: {
      ...entry.selection!,
      shape: {
        schemaVersion: "body-shape.v1",
        controls: { height: 168, muscle: 1 },
        shapeSha256: "a".repeat(64),
      },
    },
  } as BodyEntry;
  wrap(createElement(BodyChip, { job: "job-panel", person, entry: shaped }));
  expect(screen.getByText("내 체형")).toBeInTheDocument();
  expect(screen.getByText("주인공 A")).toBeInTheDocument();
});

for (const variant of ["app", "bar"] as const) {
  it(`${variant}: shows the male fallback and allows explicit auto when no recommendation exists`, () => {
    const fallback = {
      ...entry,
      selection: {
        ...entry.selection!,
        resolvedSource: "catalog_default_fallback",
        resolvedBody: { ...entry.selection!.resolvedBody!, characterId: "male-base-v0-7-2" },
        recommendation: { status: "unavailable", body: null, reasonCodes: ["provider_error"] },
      },
    } as BodyEntry;
    wrap(
      createElement(BodyExpand, { job: "fallback-" + variant, person, entry: fallback, variant }),
    );
    expect(
      screen.getByText(
        "체형을 찾지 못해 남성 기본형으로 시작했어요. 체형 더보기에서 바꿀 수 있어요.",
      ),
    ).toBeInTheDocument();
    const auto = screen.getByRole("button", { name: "자동 추천" });
    expect(auto).not.toBeDisabled();
    fireEvent.click(auto);
    expect(mutate).toHaveBeenCalledWith({ intent: "auto" });
  });
}
