import { createElement, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { BodyPreferencesPage } from "./BodyPreferencesPage";
import type { BodyPreferences, ShapeSpec } from "./contract";

/**
 * 체형 커스텀(모델 화면): 내 체형 카드(이름 변경·삭제) · 기본 모델(바꿀 수 없음) · 새 작업의 시작 방식.
 * #84의 9종 기본 체형 카드는 "기본 모델" 줄로, "내 기본값으로 시작"은 "마지막으로 쓴 체형"으로 바뀌었다.
 */
const putPreferences = vi.hoisted(() => vi.fn());
const changeCard = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const prefs = vi.hoisted(() => ({ current: null as BodyPreferences | null }));
const spec: ShapeSpec = {
  schemaVersion: "body-shape.v1",
  controls: [{ key: "height", min: 150, max: 190, step: 1, default: 175 }],
};

vi.mock("./preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./preferences")>()),
  useBodyPreferences: () => ({
    data: prefs.current,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./hooks", () => ({ useBodyOwner: () => "preview-test" }));
vi.mock("./api", () => ({
  bodyKeys: { preferences: () => ["body-preferences"] },
  putPreferences,
  changeCard,
  // useBodyCards는 같은 모듈 안의 조회를 쓰므로 API 쪽에서 값을 준다.
  getPreferences: async () => prefs.current,
}));
vi.mock("./LiveBodyView", () => ({
  NeutralImage: () => createElement("span"),
  ShapeThumb: () => createElement("span"),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: {
      origin: "server",
      characters: [
        {
          characterId: "child",
          displayName: "아동형",
          availability: "available",
          bodyRef: { characterId: "child" },
        },
        ...["female", "male"].flatMap((gender) => ["athletic", "base", "muscular"].map((preset) => ({
          characterId: `body-${gender}-${preset}`,
          displayName: `구형 성인 ${gender} ${preset}`,
          availability: "available",
          bodyRef: { characterId: `body-${gender}-${preset}` },
        }))),
      ],
    },
  }),
}));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

const base = (over: Partial<BodyPreferences> = {}): BodyPreferences => ({
  version: "body-preferences.v1",
  scope: "installation",
  mode: "last_used",
  cards: [
    {
      cardId: "card_1",
      name: "주인공 A",
      characterId: "female-base",
      controls: { height: 168 },
      createdAt: "",
      updatedAt: "",
    },
  ],
  lastUsed: null,
  shapeEditable: [{ characterId: "female-base", displayName: "기본형", shape: spec }],
  revision: 2,
  ...over,
});
function show() {
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(BodyPreferencesPage),
    ),
  );
}

beforeEach(() => {
  putPreferences.mockReset();
  changeCard.mockReset();
  navigate.mockReset();
  prefs.current = base();
});

it("+ opens the custom editor; an adjustable preset starts from itself; presets have no rename/delete", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "새 체형 만들기" }));
  expect(navigate).toHaveBeenCalledWith("/app/models/custom");
  fireEvent.click(screen.getByRole("button", { name: /기본형/ }));
  expect(navigate).toHaveBeenCalledWith("/app/models/custom?base=female-base");
  // 고정 체형(아동형)은 눌러서 커스텀할 수 없다.
  expect(screen.queryByRole("button", { name: /아동형/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /기본형 이름 변경|기본형 삭제/ })).toBeNull();
});

it("keeps adjustable bodies and child while excluding the six retired fixed adult models", () => {
  show();
  expect(screen.getByRole("button", { name: /기본형/ })).toBeTruthy();
  expect(screen.getByText("아동형")).toBeTruthy();
  expect(screen.queryByText(/구형 성인/)).toBeNull();
});

it("renames a card in place and deletes it after confirming", async () => {
  changeCard.mockImplementation(async (change) =>
    change.op === "delete"
      ? base({ cards: [], revision: 4 })
      : base({ cards: [{ ...base().cards![0]!, name: change.name }], revision: 3 }),
  );
  show();
  fireEvent.click(await screen.findByRole("button", { name: "주인공 A 이름 변경" }));
  const input = screen.getByRole("textbox", { name: "카드 이름" });
  fireEvent.change(input, { target: { value: "  민준 " } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() =>
    expect(changeCard).toHaveBeenCalledWith({ op: "update", cardId: "card_1", name: "민준" }, 2),
  );

  fireEvent.click(screen.getByRole("button", { name: "주인공 A 삭제" }));
  fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
  await waitFor(() =>
    expect(changeCard).toHaveBeenCalledWith({ op: "delete", cardId: "card_1" }, 2),
  );
});

it("starts new jobs with the last used body by default and can switch to auto", async () => {
  prefs.current = base({
    lastUsed: { characterId: "female-base", controls: { height: 168 }, usedAt: "" },
  });
  putPreferences.mockResolvedValue(base({ mode: "auto", revision: 3 }));
  show();
  const last = screen.getByRole("radio", { name: /마지막으로 쓴 체형/ });
  expect(last).toBeChecked();
  // 마지막 체형이 카드와 같으면 카드 이름으로 알려 준다.
  expect(await screen.findByText(/지금은 ‘주인공 A’/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /^자동 추천/ }));
  await waitFor(() =>
    expect(putPreferences).toHaveBeenCalledWith({ mode: "auto" }, 2),
  );
});
