import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { refineHttp } from "./refine.http";

/** 1×1 PNG. 미리보기가 바이트 그대로 실려 오는지만 보면 되므로 내용은 무관하다. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function refineBody(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "server-job",
    personIndex: 0,
    candidateId: "pose-1::front",
    refined: true,
    reasonCode: "ok_partial",
    adjustedLimbs: ["left_arm"],
    exportUrl: "/v1/pose-candidates/pose-1/export?jobId=server-job",
    ...overrides,
  };
}

describe("refineHttp", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetApiClient();
    setInstallationCredentials({ installationId: "inst_1", deviceToken: "device-token" });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiClient();
  });

  it("미리보기 경로를 화면에 붙일 수 있는 값으로 바꿔 온다", async () => {
    const thumbnailUrl = "/v1/analysis/jobs/server-job/people/0/refine/thumbnail?candidateId=x";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(refineBody({ thumbnailUrl })))
      .mockResolvedValueOnce(
        new Response(PNG_BYTES, { status: 200, headers: { "Content-Type": "image/png" } }),
      );

    const outcome = await refineHttp.refineSelection({
      jobId: "server-job",
      personIndex: 0,
      candidateId: "pose-1::front",
    });

    expect(outcome.refined).toBe(true);
    expect(outcome.previewUrl.startsWith("data:image/png;base64,")).toBe(true);
    // 상대 경로 그대로는 인증 헤더가 붙지 않아 <img>가 못 받는다. 반드시 받아 와야 한다.
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(thumbnailUrl);
  });

  it("미리보기가 없으면 빈 값이다 — 오류가 아니다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(refineBody({ thumbnailUrl: null })));

    const outcome = await refineHttp.refineSelection({
      jobId: "server-job",
      personIndex: 0,
      candidateId: "pose-1::front",
    });

    expect(outcome.previewUrl).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 그림 하나가 없다고 저장 흐름이 멈추면 안 된다. 조정 결과 자체는 이미 받아 놨다.
  it("미리보기 조회가 실패해도 조정 결과는 그대로 돌려준다", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(refineBody({ thumbnailUrl: "/v1/analysis/jobs/x/people/0/refine/thumbnail" })),
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));

    const outcome = await refineHttp.refineSelection({
      jobId: "server-job",
      personIndex: 0,
      candidateId: "pose-1::front",
    });

    expect(outcome.refined).toBe(true);
    expect(outcome.exportUrl).toBe("/v1/pose-candidates/pose-1/export?jobId=server-job");
    expect(outcome.previewUrl).toBe("");
  });
});
