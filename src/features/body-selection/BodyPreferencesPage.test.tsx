import { createElement, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { BodyPreferencesPage } from "./BodyPreferencesPage";
import type { BodyPreferences } from "./contract";

/**
 * 체형 기본 설정: 위는 "내 기본값" 편집기(MyDefaultEditor, 따로 테스트), 아래는 새 작업의 시작 방식.
 * #84의 9종 기본 체형 카드는 편집기의 프리셋 카드로 옮겨 갔다.
 */
const putPreferences = vi.hoisted(() => vi.fn());
const prefs = vi.hoisted(() => ({ current: null as BodyPreferences | null }));

vi.mock("./preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./preferences")>()),
  useBodyPreferences: () => ({
    data: prefs.current,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./MyDefaultEditor", () => ({
  MyDefaultEditor: () => createElement("section", null, "내 기본값 편집기"),
}));
vi.mock("./hooks", () => ({ useBodyOwner: () => "preview-test" }));
vi.mock("./api", () => ({
  bodyKeys: { preferences: () => ["body-preferences"] },
  putPreferences,
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: { origin: "server", characters: [{ characterId: "female-base", displayName: "기본형" }] },
  }),
}));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

const base = (over: Partial<BodyPreferences> = {}): BodyPreferences => ({
  version: "body-preferences.v1",
  scope: "installation",
  mode: "auto",
  defaultCharacterId: null,
  shapeDefault: null,
  revision: 0,
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
});

it("keeps 'start with my default' off until a default is saved", () => {
  prefs.current = base();
  show();
  expect(screen.getByText("내 기본값 편집기")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /내 기본값으로 시작/ })).toBeDisabled();
  expect(screen.getByText("먼저 위에서 내 기본값을 저장하세요.")).toBeInTheDocument();
});

it("switches the start mode and keeps the saved default body", async () => {
  prefs.current = base({ defaultCharacterId: "female-base", revision: 2 });
  putPreferences.mockResolvedValue(
    base({ mode: "fixed_default", defaultCharacterId: "female-base", revision: 3 }),
  );
  show();
  fireEvent.click(screen.getByRole("radio", { name: /내 기본값으로 시작 · 기본형/ }));
  await waitFor(() =>
    expect(putPreferences).toHaveBeenCalledWith(
      { mode: "fixed_default", defaultCharacterId: "female-base" },
      2,
    ),
  );
});
