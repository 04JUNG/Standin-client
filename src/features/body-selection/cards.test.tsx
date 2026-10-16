import { createElement } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { cardsOf, cleanCardName, matchCard, nextCardName, useBodyCards } from "./preferences";
import { groupControls } from "./shapeGroups";
import { ShapeControlGrid } from "./ShapeControls";
import type { BodyCard, BodyPreferences, ShapeSpec } from "./contract";

const api = vi.hoisted(() => ({ getPreferences: vi.fn(), changeCard: vi.fn() }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...api,
}));

const card = (over: Partial<BodyCard> = {}): BodyCard => ({
  cardId: "card_1",
  name: "주인공 A",
  characterId: "male-bulk",
  controls: { height: 182, muscle: 1 },
  createdAt: "2026-10-16T00:00:00Z",
  updatedAt: "2026-10-16T00:00:00Z",
  ...over,
});
const prefs = (over: Partial<BodyPreferences> = {}): BodyPreferences => ({
  version: "body-preferences.v1",
  scope: "installation",
  mode: "last_used",
  defaultCharacterId: null,
  shapeDefault: null,
  cards: [],
  lastUsed: null,
  revision: 4,
  ...over,
});
const spec: ShapeSpec = {
  schemaVersion: "body-shape.v1",
  basic: 2,
  controls: [
    { key: "height", min: 160, max: 195, step: 1, default: 178 },
    { key: "muscle", min: 0, max: 2, step: 0.05, default: 0 },
    { key: "head_scale", min: 0.9, max: 1, step: 0.01, default: 1 },
    { key: "leg_length", min: -1, max: 1, step: 0.05, default: 0 },
    { key: "detail_calf", min: -1, max: 1, step: 0.05, default: 0 },
    { key: "brand_new_key", min: -1, max: 1, step: 0.05, default: 0 },
  ],
};
function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}
beforeEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "2026-08-02" },
  });
});

describe("체형 카드 규칙", () => {
  it("shows an older 내 기본값 as one card when the server has no cards yet", () => {
    expect(cardsOf(null)).toEqual([]);
    expect(cardsOf(prefs({ cards: [card()] }))).toEqual([card()]);
    const legacy = prefs({
      cards: undefined,
      shapeDefault: { characterId: "male-bulk", controls: { muscle: 1 } },
    });
    expect(cardsOf(legacy)).toMatchObject([{ cardId: "my-default", name: "내 기본 체형" }]);
  });

  it("names new cards 주인공 A, B, … skipping names in use", () => {
    expect(nextCardName([])).toBe("주인공 A");
    expect(nextCardName([{ name: "주인공 A" }, { name: " 주인공 B " }])).toBe("주인공 C");
  });

  it("trims names and rejects empty or too long ones", () => {
    expect(cleanCardName("  주인공 A ")).toBe("주인공 A");
    expect(cleanCardName("   ")).toBeNull();
    expect(cleanCardName("가".repeat(25))).toBeNull();
  });

  it("matches a card only when body and numbers are the same", () => {
    const cards = [card()];
    expect(matchCard(cards, "male-bulk", { height: 182, muscle: 1 }, spec)?.cardId).toBe("card_1");
    // Missing keys count as the body's start values.
    expect(
      matchCard(cards, "male-bulk", { height: 182, muscle: 1, head_scale: 1 }, spec),
    ).toBeDefined();
    expect(matchCard(cards, "male-bulk", { height: 183, muscle: 1 }, spec)).toBeUndefined();
    expect(matchCard(cards, "male-base", { height: 182, muscle: 1 }, spec)).toBeUndefined();
    // Without a spec a plain (unshaped) body never claims to be a card.
    expect(matchCard(cards, "male-bulk", null)).toBeUndefined();
  });
});

describe("전문가용 조절", () => {
  it("groups the detail keys by body part and keeps unknown keys", () => {
    const groups = groupControls(spec.controls.slice(2));
    expect(groups.map((g) => [g.label, g.controls.map((c) => c.key)])).toEqual([
      ["비율·길이", ["leg_length"]],
      ["머리·목", ["head_scale"]],
      ["근육", ["detail_calf"]],
      ["기타", ["brand_new_key"]],
    ]);
  });

  it("shows only the basic sliders until 전문가용 is on, then every detail control", () => {
    const props = {
      spec,
      values: {},
      onChange: () => {},
      idPrefix: "t",
      detailColumns: 4 as const,
    };
    const { rerender } = render(createElement(ShapeControlGrid, { ...props, detail: "hidden" }));
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    rerender(createElement(ShapeControlGrid, { ...props, detail: "expert" }));
    expect(screen.getAllByRole("slider")).toHaveLength(6);
    expect(screen.getByRole("group", { name: "머리·목" })).toBeInTheDocument();
  });
});

describe("useBodyCards", () => {
  it("sends card changes with the current revision and keeps the server answer", async () => {
    api.getPreferences.mockResolvedValue(prefs());
    api.changeCard.mockResolvedValue(prefs({ cards: [card()], revision: 5 }));
    const { result } = renderHook(() => useBodyCards(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.query.data).toBeDefined());
    expect(result.current.supported).toBe(true);
    await act(() =>
      result.current.change.mutateAsync({
        op: "create",
        name: "주인공 A",
        characterId: "male-bulk",
        controls: { height: 182, muscle: 1 },
      }),
    );
    expect(api.changeCard).toHaveBeenCalledWith(
      {
        op: "create",
        name: "주인공 A",
        characterId: "male-bulk",
        controls: { height: 182, muscle: 1 },
      },
      4,
    );
    await waitFor(() => expect(result.current.cards).toEqual([card()]));
  });

  it("re-reads settings after a failed change (another window may have changed them)", async () => {
    api.getPreferences.mockResolvedValue(prefs({ cards: [card()] }));
    api.changeCard.mockRejectedValue(new Error("BODY_PREFERENCE_CONFLICT"));
    const { result } = renderHook(() => useBodyCards(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.cards).toHaveLength(1));
    await act(async () => {
      await result.current.change
        .mutateAsync({ op: "delete", cardId: "card_1" })
        .catch(() => undefined);
    });
    await waitFor(() => expect(api.getPreferences).toHaveBeenCalledTimes(2));
  });

  it("is read-only against a server that does not know cards", async () => {
    api.getPreferences.mockResolvedValue(prefs({ cards: undefined }));
    const { result } = renderHook(() => useBodyCards(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.query.data).toBeDefined());
    expect(result.current.supported).toBe(false);
  });
});
