import { webcrypto } from "node:crypto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { CspSaveButton, checkedCspDownload, cspSaveUrl } from "./CspSaveButton";
import { apiFetchResponse } from "@/shared/api/client";
import { getSelection } from "@/features/body-selection/api";
import { exportService } from "../api/export.service";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";

vi.mock("@/features/pose-viewer/hooks/useAnalysisResult", () => ({
  useAnalysisResult: () => ({
    data: { capabilities: { cspNativeExport: { characterIds: ["male-test"] } } },
  }),
}));
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
vi.mock("@/features/body-selection/api", () => ({
  bodyKeys: { selection: () => ["body-test"] },
  getSelection: vi.fn(),
}));
vi.mock("../api/export.service", () => ({
  exportService: {
    getDefaultFolder: vi.fn(async () => "/downloads"),
    folderExists: vi.fn(async () => true),
    chooseFolder: vi.fn(),
    saveCandidates: vi.fn(async () => [{ path: "/downloads/CSP.zip" }]),
    revealInFolder: vi.fn(async () => {}),
  },
}));
const selection = {
  selectionRevision: 2,
  resolutionStatus: "ready",
  resolvedBody: { characterId: "male-test" },
};
const bytes = new TextEncoder().encode("PK-test-bundle");
async function response(hash = true) {
  const sha = Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", bytes)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "X-Standin-Artifact-SHA256": hash ? sha : "0".repeat(64),
    },
  });
}
beforeEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  vi.mocked(getSelection).mockResolvedValue(selection as Awaited<ReturnType<typeof getSelection>>);
  usePoseSelectionStore.setState({ selectedByPerson: { 0: "candidate" } });
});
afterEach(() => vi.clearAllMocks());
describe("CSP body save", () => {
  it("binds persisted body revision and pose rather than sending raw sliders", () => {
    const u = new URL(cspSaveUrl("job", 0, "candidate", "pose", 2), "https://test.invalid");
    expect(u.searchParams.get("bodySelectionRevision")).toBe("2");
    expect(u.searchParams.get("poseId")).toBe("pose");
    expect(u.searchParams.has("shape")).toBe(false);
  });
  it("rejects a corrupted bundle before handing it to the file writer", async () => {
    vi.mocked(apiFetchResponse).mockResolvedValue(await response(false));
    await expect(checkedCspDownload("/test")).rejects.toThrow("검증");
    expect(exportService.saveCandidates).not.toHaveBeenCalled();
  });
  it("saves checked ZIP bytes through the existing native writer", async () => {
    vi.mocked(apiFetchResponse).mockResolvedValue(await response());
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CspSaveButton
          jobId="job"
          personIndex={0}
          candidateId="candidate"
          poseId="pose"
          characterIds={["male-test"]}
        />
      </QueryClientProvider>,
    );
    const button = screen.getByRole("button", { name: "CSP 인형·포즈 저장" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(exportService.saveCandidates).toHaveBeenCalled());
    expect(vi.mocked(exportService.saveCandidates).mock.calls[0][0].files[0].fileName).toMatch(
      /\.zip$/,
    );
    expect(
      Array.from(vi.mocked(exportService.saveCandidates).mock.calls[0][0].files[0].content),
    ).toEqual(Array.from(bytes));
  });
  it("discards bytes if body revision changes before the native write", async () => {
    vi.mocked(getSelection)
      .mockResolvedValueOnce(selection as Awaited<ReturnType<typeof getSelection>>)
      .mockResolvedValue({ ...selection, selectionRevision: 3 } as Awaited<
        ReturnType<typeof getSelection>
      >);
    vi.mocked(apiFetchResponse).mockResolvedValue(await response());
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CspSaveButton
          jobId="job"
          personIndex={0}
          candidateId="candidate"
          poseId="pose"
          characterIds={["male-test"]}
        />
      </QueryClientProvider>,
    );
    const button = screen.getByRole("button", { name: "CSP 인형·포즈 저장" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText(/저장하지 못했어요/);
    expect(exportService.saveCandidates).not.toHaveBeenCalled();
  });
});
