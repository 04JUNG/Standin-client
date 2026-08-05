import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { safeStorage } from "@/shared/lib/safeStorage";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import type { UploadDraft } from "@/shared/types/upload";
import { AnalysisError } from "../api/pose.contract";

const analyze = vi.fn();
vi.mock("../api/pose.service", () => ({ poseService: { analyze: (...args: unknown[]) => analyze(...args) } }));

const { useAnalysisResult } = await import("./useAnalysisResult");

const QUEUE_KEY = "standin.analytics.queue.v1";

type QueuedEvent = {
  name: string;
  jobId?: string;
  properties: Record<string, string | number | boolean | null>;
};

function queued(): QueuedEvent[] {
  return JSON.parse(safeStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedEvent[];
}

function draftFixture(): UploadDraft {
  return {
    id: "draft-1",
    source: "capture",
    file: new File(["x"], "rough.png", { type: "image/png" }),
    previewUrl: "data:image/png;base64,",
    originalName: "rough.png",
    mimeType: "image/png",
    width: 640,
    height: 480,
    sizeBytes: 8003,
    createdAt: "2026-08-03T02:00:00.000Z",
  };
}

function wrapper({ children }: { children: ReactNode }) {
  // 재시도를 끄지 않으면 실패 상태에 도달하기까지 테스트가 타이머를 기다린다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useAnalysisResult 실패 계측", () => {
  beforeEach(() => {
    safeStorage.removeItem(QUEUE_KEY);
    safeStorage.removeItem("standin.analytics.sequence.v1");
    useUploadStore.setState({ draft: draftFixture(), origin: "app" });
    // 이벤트가 큐에 남도록 전송을 실패시킨다. 큐 내용이 곧 "무엇을 남겼는가"다.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    analyze.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUploadStore.setState({ draft: null });
  });

  it("분석이 실패하면 사유 코드와 함께 analysis_failed를 남긴다", async () => {
    analyze.mockRejectedValue(new AnalysisError("TIMEOUT", "오래 걸립니다"));

    renderHook(() => useAnalysisResult("client-job-timeout"), { wrapper });

    await waitFor(() => {
      expect(queued().some((event) => event.name === "analysis_failed")).toBe(true);
    });
    const event = queued().find((e) => e.name === "analysis_failed")!;
    expect(event.properties.reason).toBe("TIMEOUT");
    expect(event.properties.surface).toBe("app");
    // 서버 jobId를 모르는 시점이라 job에 연결하면 배치 전체가 404로 거절된다.
    expect(event.jobId).toBeUndefined();
  });

  it("서버 5xx와 네트워크 실패를 다른 사유로 구분한다", async () => {
    analyze.mockRejectedValue(new ApiError(503, "UPSTREAM_UNAVAILABLE", "unavailable"));
    renderHook(() => useAnalysisResult("client-job-5xx"), { wrapper });
    await waitFor(() => {
      expect(queued().find((e) => e.name === "analysis_failed")?.properties.reason).toBe(
        "SERVER_ERROR",
      );
    });

    safeStorage.removeItem(QUEUE_KEY);
    analyze.mockRejectedValue({ kind: "network", message: "연결 실패", retryable: true });
    renderHook(() => useAnalysisResult("client-job-network"), { wrapper });
    await waitFor(() => {
      expect(queued().find((e) => e.name === "analysis_failed")?.properties.reason).toBe("NETWORK");
    });
  });

  it("같은 후보를 다시 눌러도 후보 변경으로 세지 않는다", async () => {
    analyze.mockResolvedValue({
      jobId: "server-job",
      people: [
        {
          index: 0,
          candidates: [
            {
              id: "cand-1",
              poseId: "pose-1",
              rank: 1,
              title: "포즈 1",
              tags: [],
              matchLevel: "high" as const,
              thumbnailUrl: "",
              previewImages: [],
              modelUrl: null,
              bvhAvailable: false,
            },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useAnalysisResult("client-job-select"), { wrapper });
    await waitFor(() => expect(result.current.people).toHaveLength(1));

    result.current.selectCandidate(0, "cand-1");
    await waitFor(() =>
      expect(queued().filter((e) => e.name === "candidate_selected")).toHaveLength(1),
    );

    // 이미 선택된 후보를 다시 누른다.
    result.current.selectCandidate(0, "cand-1");
    expect(queued().filter((e) => e.name === "candidate_selected")).toHaveLength(1);
  });

  // FE-02. soft는 저신뢰지만 고를 수 있고, hard만 선택 대상에서 빠진다. 둘을 후보 개수로
  // 뭉뚱그리면 "참고용 후보가 있다"와 "후보가 없다"를 화면이 구분할 수 없다.
  it("soft fallback은 선택 가능하고 hard만 제외한다", async () => {
    const candidateFixture = {
      id: "cand-1",
      poseId: "pose-1",
      rank: 1,
      title: "포즈 1",
      tags: [],
      matchLevel: "low" as const,
      thumbnailUrl: "",
      previewImages: [],
      modelUrl: null,
      bvhAvailable: false,
    };
    analyze.mockResolvedValue({
      jobId: "server-job",
      capabilities: { refine: false },
      people: [
        {
          index: 0,
          fallbackMode: "soft",
          confidence: "low",
          skeletonState: "partial",
          skeletonSource: "crop_retry",
          coverageClass: "reduced",
          refineAllowed: false,
          refinableLimbs: [],
          candidates: [candidateFixture],
        },
        {
          index: 1,
          fallbackMode: "hard",
          confidence: "low",
          skeletonState: "missing",
          skeletonSource: "none",
          coverageClass: "insufficient",
          refineAllowed: false,
          refinableLimbs: [],
          candidates: [],
        },
      ],
    });

    const { result } = renderHook(() => useAnalysisResult("client-job-fallback"), { wrapper });
    await waitFor(() => expect(result.current.people).toHaveLength(2));

    expect(result.current.selectablePeople.map((p) => p.index)).toEqual([0]);
    expect(result.current.failedPeople.map((p) => p.index)).toEqual([1]);

    // hard인 인물이 있어도 나머지 인물만 고르면 저장으로 넘어갈 수 있어야 한다.
    result.current.selectCandidate(0, "cand-1");
    await waitFor(() => expect(result.current.allSelected).toBe(true));
  });
});
