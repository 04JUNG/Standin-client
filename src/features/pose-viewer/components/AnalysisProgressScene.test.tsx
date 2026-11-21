import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { ProgressCandidates, ProgressImage } from "./AnalysisProgressScene";
import { previewCandidates } from "@/dev/analysis-progress-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetApiClient();
  vi.useRealTimers();
});
describe("candidate stream lifecycle", () => {
  it("keeps a single image per real candidate and cancels decorative work on exit", () => {
    vi.useFakeTimers();
    const view = render(<ProgressCandidates candidates={previewCandidates} ranking={false} />);
    const images = [...view.container.querySelectorAll("img")];
    expect(images).toHaveLength(5);
    expect(view.container.querySelector('[data-flowing="true"]')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1650));
    expect(view.container.querySelector('[data-flowing="true"]')).toBeInTheDocument();
    view.rerender(<ProgressCandidates candidates={[...previewCandidates]} ranking={false} />);
    expect([...view.container.querySelectorAll("img")]).toEqual(images);
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
    const early = render(<ProgressCandidates candidates={previewCandidates} ranking={false} />);
    early.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
describe("ready progress images", () => {
  it("loads protected API images with the installation identity and revokes blobs on exit", async () => {
    setInstallationCredentials({ installationId: "inst_a", deviceToken: "device_a" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["ready"], { type: "image/png" }), {
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn().mockReturnValue("blob:protected");
    const revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const view = render(
      <ProgressImage url="/v1/analysis/jobs/job_a/progress/image" alt="후보 1" />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "후보 1" })).toHaveAttribute("src", "blob:protected"),
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "X-Installation-Id": "inst_a",
      "X-Device-Token": "device_a",
    });
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:protected");
  });
  it("does not send credentials to an external image", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ProgressImage url="https://images.example.com/ready.png" alt="후보" />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "후보" })).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
    view.unmount();
  });
  it("aborts obsolete images and never displays them under the new candidate", async () => {
    let finish: ((r: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            finish = r;
          }),
      )
      .mockRejectedValue(new Error("missing"));
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = vi.fn();
      },
    );
    const view = render(<ProgressImage url="/v1/a" alt="후보 A" />);
    view.rerender(<ProgressImage url="/v1/b" alt="후보 B" />);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => finish?.(new Response(new Blob(["ready"], { type: "image/png" }))));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "후보 B 준비 중" })).toBeInTheDocument();
    view.unmount();
  });
});
