import { createElement, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { BodyPreferencesPage } from "./BodyPreferencesPage";
import { BODY_PREVIEWS } from "@/features/models/lib/previewImages";

const putPreferences = vi.hoisted(() => vi.fn());
const characters = [
  "male-base",
  "female-base",
  "teen-male",
  "teen-female",
  "child",
  "male-athletic",
  "female-athletic",
  "male-muscular",
  "female-muscular",
].map((id) => ({
  characterId: `body-${id}`,
  displayName: id,
  availability: "available",
  bodyRef: { characterId: `body-${id}`, assetSha256: BODY_PREVIEWS[`body-${id}`]!.assetSha256 },
  previewUrl: null,
}));

vi.mock("./preferences", () => ({
  useBodyPreferences: () => ({
    data: { mode: "auto", defaultCharacterId: null, revision: 0 },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("./hooks", () => ({ useBodyOwner: () => "preview-test" }));
vi.mock("./api", () => ({
  bodyKeys: { preferences: () => ["body-preferences"] },
  putPreferences,
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { origin: "server", characters } }),
}));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

it("shows all nine neutral images and saves a clicked default body", async () => {
  putPreferences.mockResolvedValue({ mode: "auto", defaultCharacterId: "body-female-muscular", revision: 1 });
  const queryClient = new QueryClient();
  render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(BodyPreferencesPage)),
  );

  const cards = screen.getByRole("radiogroup", { name: "내 기본 체형" });
  expect(cards.querySelectorAll('button[role="radio"]')).toHaveLength(9);
  expect(cards.querySelectorAll("img")).toHaveLength(9);
  fireEvent.click(screen.getByRole("radio", { name: "female-muscular" }));
  await waitFor(() =>
    expect(putPreferences).toHaveBeenCalledWith(
      { mode: "auto", defaultCharacterId: "body-female-muscular" },
      0,
    ),
  );
});
