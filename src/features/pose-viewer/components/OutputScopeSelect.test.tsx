import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputScopeSelect } from "./OutputScopeSelect";
import { readOutputScope, saveOutputScope, type OutputScope } from "../api/outputScope";
import type { AnalysisResult, PersonResult } from "../api/pose.contract";
import { poseQueryKeys } from "../queryKeys";

vi.mock("../api/outputScope", async (original) => ({
  ...(await original<typeof import("../api/outputScope")>()),
  saveOutputScope: vi.fn(),
}));
const save = vi.mocked(saveOutputScope);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detection: OutputScope = {
  selection: "auto",
  detected: "half",
  detectionSource: "vlm_person",
  resolved: "half",
  resolutionSource: "auto",
};
function result(): AnalysisResult {
  const person = (index: number): PersonResult => ({
    index,
    candidates: [],
    confidence: "low",
    skeletonState: "missing",
    skeletonSource: "none",
    coverageClass: "insufficient",
    fallbackMode: "hard",
    refineAllowed: false,
    refinableLimbs: [],
    outputScope: { ...detection },
  });
  return {
    jobId: "job_test",
    people: [person(0), person(1)],
    capabilities: {
      refine: false,
      fbxExport: false,
      characterSelection: false,
      outputScopeSelection: true,
    },
  };
}
function setup(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const key = poseQueryKeys.result("live-route");
  client.setQueryData(key, result());
  client.setQueryData(poseQueryKeys.result("job_test"), result());
  client.setQueryData(poseQueryKeys.result("job_other"), { ...result(), jobId: "job_other" });
  function Harness() {
    const { data } = useQuery({ queryKey: key, queryFn: result, staleTime: Infinity });
    return data!.people.map((person) => (
      <OutputScopeSelect key={person.index} jobId={data!.jobId} person={person} enabled={enabled} />
    ));
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return client;
}

describe("output framing selection", () => {
  it("does not show a working selector against an old BFF", () => {
    setup(false);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(readOutputScope(undefined).resolutionSource).toBe("fallback");
  });

  it("persists only the chosen person, updates live/history caches and returns to auto", async () => {
    const client = setup();
    save.mockImplementation(async (_job, _index, selection, current) => ({
      ...current,
      selection,
      resolved: selection === "auto" ? "half" : selection,
      resolutionSource: selection === "auto" ? "auto" : "user",
    }));
    const first = screen.getByRole("combobox", { name: "인물 1의 출력 범위" });
    fireEvent.change(first, { target: { value: "head" } });
    await waitFor(() => expect(first).toHaveValue("head"));
    expect(save).toHaveBeenCalledWith("job_test", 0, "head", detection);
    expect(screen.getByRole("combobox", { name: "인물 2의 출력 범위" })).toHaveValue("auto");
    expect(
      client.getQueryData<AnalysisResult>(poseQueryKeys.result("job_test"))?.people[0].outputScope
        ?.selection,
    ).toBe("head");
    expect(
      client.getQueryData<AnalysisResult>(poseQueryKeys.result("job_other"))?.people[0].outputScope
        ?.selection,
    ).toBe("auto");
    fireEvent.change(first, { target: { value: "auto" } });
    await waitFor(() => expect(first).toHaveValue("auto"));
    expect(
      client.getQueryData<AnalysisResult>(poseQueryKeys.result("job_test"))?.people[0].outputScope
        ?.detected,
    ).toBe("half");
  });

  it("retains the saved value on failure and lets the user retry", async () => {
    setup();
    save.mockRejectedValueOnce(new Error("offline"));
    const first = screen.getByRole("combobox", { name: "인물 1의 출력 범위" });
    fireEvent.change(first, { target: { value: "bust" } });
    await screen.findByRole("alert");
    expect(first).toHaveValue("auto");
    save.mockResolvedValueOnce({
      ...detection,
      selection: "bust",
      resolved: "bust",
      resolutionSource: "user",
    });
    fireEvent.change(first, { target: { value: "bust" } });
    await waitFor(() => expect(first).toHaveValue("bust"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("locks the selector until persistence completes", async () => {
    setup();
    let finish!: (value: OutputScope) => void;
    save.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = screen.getByRole("combobox", { name: "인물 1의 출력 범위" });
    fireEvent.change(first, { target: { value: "full" } });
    await waitFor(() => expect(first).toBeDisabled());
    finish({ ...detection, selection: "full", resolved: "full", resolutionSource: "user" });
    await waitFor(() => expect(first).not.toBeDisabled());
  });
});
