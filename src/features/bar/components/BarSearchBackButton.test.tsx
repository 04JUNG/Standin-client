import { beforeEach, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useExportStore } from "@/features/export/store/exportStore";
import { BarSearchBackButton } from "./BarSearchBackButton";

function Location() {
  const { pathname, state } = useLocation();
  return <output>{JSON.stringify({ pathname, state })}</output>;
}
beforeEach(() => {
  useExportStore.persist.setOptions({
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});
it.each([
  { query: undefined, pathname: "/bar/actions", state: null },
  { query: "오른팔을 올린 자세", pathname: "/bar/search", state: { query: "오른팔을 올린 자세" } },
])(
  "goes to $pathname without following stale browser history or mutating work",
  ({ query, pathname, state }) => {
    const qc = new QueryClient();
    const handChoice = { left: "hand-a" },
      bodyChoice = { characterId: "body-a" };
    qc.setQueryData(["hands", "current"], handChoice);
    qc.setQueryData(["bodies", "current"], bodyChoice);
    usePoseSelectionStore.setState({
      jobId: "current",
      selectedByPerson: { 0: "pose-a" },
      characterByPerson: { 0: "body-a" },
    });
    useExportStore.setState({ jobId: "current", status: "saved", savedPaths: ["/saved/a.fbx"] });
    const selection = usePoseSelectionStore.getState(),
      upload = useUploadStore.getState(),
      exported = useExportStore.getState();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/auth/login", "/app/jobs/old", "/bar/candidates"]}>
          <BarSearchBackButton query={query} />
          <Location />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "뒤로가기" }));
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ pathname, state });
    expect(usePoseSelectionStore.getState()).toBe(selection);
    expect(useUploadStore.getState()).toBe(upload);
    expect(useExportStore.getState()).toBe(exported);
    expect(qc.getQueryData(["hands", "current"])).toBe(handChoice);
    expect(qc.getQueryData(["bodies", "current"])).toBe(bodyChoice);
  },
);
