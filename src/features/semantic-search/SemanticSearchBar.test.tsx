import { clearSearchDrafts } from "./searchDraft";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { SemanticSearchBar } from "./SemanticSearchBar";
beforeEach(clearSearchDrafts);
vi.mock("./api", () => ({
  searchCapabilities: vi.fn(async () => ({
    available: true,
    maxQueryLength: 500,
    maxTopK: 20,
    supportsAllResults: true,
  })),
  searchPoses: vi.fn(() => new Promise(() => {})),
}));
it.each(["app", "bar"] as const)(
  "a new displayed job resets its own scroll while preserving the search input and focus (%s)",
  async (surface) => {
    const qc = new QueryClient();
    const view = (job: string, text: string) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <div data-testid="scroller" style={{ overflowY: "auto" }}>
            <SemanticSearchBar resultKey={job} initialQuery={text} surface={surface} />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const r = render(view("job_first", "첫 문장"));
    const input = screen.getByRole("searchbox");
    await waitFor(() => expect(screen.getByRole("button", { name: "다시 검색" })).toBeEnabled());
    fireEvent.focus(input);
    input.focus();
    const scroll = screen.getByTestId("scroller");
    Object.defineProperty(scroll, "scrollHeight", { value: 5000 });
    Object.defineProperty(scroll, "clientHeight", { value: 400 });
    scroll.scrollTop = 1200;
    r.rerender(view("job_second", "다른 작업 문장"));
    expect(scroll.scrollTop).toBe(0);
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("다른 작업 문장");
  },
);
