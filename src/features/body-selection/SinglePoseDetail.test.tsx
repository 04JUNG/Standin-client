import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SinglePoseDetail } from "./SinglePoseDetail";
import { getManifest, renderBodyCandidate } from "./api";
import type { BodySelection } from "./contract";
import { useInstallationStore } from "@/features/installation/installationStore";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getManifest: vi.fn(),
  renderBodyCandidate: vi.fn(),
}));
const selection = {
  personIndex: 0,
  selectionRevision: 1,
  resolutionStatus: "ready",
  resolvedBody: { characterId: "female", assetSha256: "a".repeat(64) },
} as BodySelection;
beforeEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "test" },
  });
});
afterEach(() => {
  useInstallationStore.setState({ credentials: null });
});
it("body and scope updates do no automatic work; reopening one candidate never reuses a previous scope/camera", async () => {
  const qc = new QueryClient();
  let scope = "half",
    camera = 1;
  vi.mocked(getManifest).mockImplementation(
    async () =>
      ({ outputScope: scope, candidates: [{ candidateId: "one" }] }) as Awaited<
        ReturnType<typeof getManifest>
      >,
  );
  vi.mocked(renderBodyCandidate).mockImplementation(
    async () => "data:image/png;base64," + btoa(scope + camera),
  );
  const view = () => (
    <QueryClientProvider client={qc}>
      <img alt="기본 포즈" src="/default-poster.png" />
      <SinglePoseDetail
        job="job"
        selection={selection}
        candidateId="one"
        scope={scope}
        sourceIdentity={{ sha: "a", camera }}
      />
    </QueryClientProvider>
  );
  const r = render(view());
  expect(getManifest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("선택 체형으로 이 포즈만 보기"));
  expect(await screen.findByAltText("선택한 체형을 적용한 단일 포즈 미리보기")).toHaveAttribute(
    "src",
    "data:image/png;base64," + btoa("half1"),
  );
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  scope = "head";
  r.rerender(view());
  expect(renderBodyCandidate).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("선택 체형으로 이 포즈만 보기"));
  expect(await screen.findByAltText("선택한 체형을 적용한 단일 포즈 미리보기")).toHaveAttribute(
    "src",
    "data:image/png;base64," + btoa("head1"),
  );
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  camera = 2;
  r.rerender(view());
  fireEvent.click(screen.getByText("선택 체형으로 이 포즈만 보기"));
  await waitFor(() => expect(renderBodyCandidate).toHaveBeenCalledTimes(3));
  expect(screen.getByAltText("기본 포즈")).toHaveAttribute("src", "/default-poster.png");
  r.unmount();
  qc.clear();
});
it("a late old scope cannot replace an open detail after scope changes", async () => {
  const finish: ((s: string) => void)[] = [];
  let scope = "half";
  vi.mocked(getManifest).mockImplementation(
    async () =>
      ({ outputScope: scope, candidates: [{ candidateId: "one" }] }) as Awaited<
        ReturnType<typeof getManifest>
      >,
  );
  vi.mocked(renderBodyCandidate).mockImplementation(() => new Promise((r) => finish.push(r)));
  const qc = new QueryClient();
  const view = () => (
    <QueryClientProvider client={qc}>
      <SinglePoseDetail job="job" selection={selection} candidateId="one" scope={scope} />
    </QueryClientProvider>
  );
  const r = render(view());
  fireEvent.click(screen.getByText("선택 체형으로 이 포즈만 보기"));
  await waitFor(() => expect(finish).toHaveLength(1));
  scope = "head";
  r.rerender(view());
  await act(async () => finish[0]("data:image/png;base64,b2xk"));
  expect(screen.queryByAltText("선택한 체형을 적용한 단일 포즈 미리보기")).toBeNull();
  await waitFor(() => expect(finish).toHaveLength(2));
  await act(async () => finish[1]("data:image/png;base64,bmV3"));
  expect(await screen.findByAltText("선택한 체형을 적용한 단일 포즈 미리보기")).toHaveAttribute(
    "src",
    "data:image/png;base64,bmV3",
  );
  r.unmount();
  qc.clear();
});
