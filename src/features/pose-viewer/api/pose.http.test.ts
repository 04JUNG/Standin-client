import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetApiClient,
  setAccessToken,
  setInstallationCredentials,
} from "@/shared/api/client";
import { env } from "@/shared/lib/env";
import { poseHttp } from "./pose.http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("poseHttp", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetApiClient();
    setAccessToken("access-token");
    setInstallationCredentials({ installationId: "inst_1", deviceToken: "device-token" });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiClient();
  });

  it("인증된 multipart Job을 만들고 완료 결과를 클라이언트 후보로 변환한다", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "server-job", status: "queued", createdAt: "now" }, 202),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "server-job",
          status: "completed",
          createdAt: "now",
          updatedAt: "now",
          error: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "server-job",
          notes: [],
          candidatesByPerson: [
            {
              personIndex: 0,
              box: [0, 0, 100, 100],
              tags: { shot: "full" },
              candidates: [
                {
                  id: "wave pose",
                  poseId: "wave pose",
                  rank: 1,
                  view: "front",
                  tags: ["standing", "solo"],
                  matchLevel: "high",
                  bvhAvailable: true,
                  thumbnailUrl: "/v1/pose-candidates/wave%20pose/thumbnail?view=front",
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        }),
      );

    const file = new File(["image"], "rough.png", { type: "image/png" });
    const result = await poseHttp.analyze({
      jobId: "client-route-job",
      file,
      source: "file",
      width: 1,
      height: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe(`${env.apiBaseUrl}/v1/analysis/jobs`);
    const createInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(createInit.body).toBeInstanceOf(FormData);
    expect((createInit.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect((createInit.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    expect((createInit.headers as Record<string, string>)["X-Installation-Id"]).toBe("inst_1");
    expect(fetchMock.mock.calls[1][0]).toBe(`${env.apiBaseUrl}/v1/analysis/jobs/server-job`);
    expect(fetchMock.mock.calls[2][0]).toBe(`${env.apiBaseUrl}/v1/analysis/jobs/server-job/result`);
    expect(fetchMock.mock.calls[3][0]).toBe(
      `${env.apiBaseUrl}/v1/pose-candidates/wave%20pose/thumbnail?view=front`,
    );
    expect(
      ((fetchMock.mock.calls[3][1] as RequestInit).headers as Record<string, string>)[
        "Authorization"
      ],
    ).toBeUndefined();
    expect(result).toEqual({
      jobId: "server-job",
      people: [
        {
          index: 0,
          candidates: [
            {
              id: "wave pose",
              poseId: "wave pose",
              rank: 1,
              title: "포즈 wave pose",
              tags: ["standing", "solo"],
              matchLevel: "high",
              thumbnailUrl: "data:image/png;base64,iVBORw==",
              previewImages: [{ view: "front", url: "data:image/png;base64,iVBORw==" }],
              modelUrl: null,
              bvhAvailable: true,
              bvhUrl:
                "/v1/pose-candidates/wave%20pose/export?jobId=server-job&personIndex=0&candidateId=wave+pose",
            },
          ],
        },
      ],
    });
  });

  it("서버 Job이 실패하면 사용자용 분석 오류를 반환한다", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "failed-job", status: "queued", createdAt: "now" }, 202),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "failed-job",
          status: "failed",
          createdAt: "now",
          updatedAt: "now",
          error: "INFERENCE_FAILED",
        }),
      );

    await expect(
      poseHttp.analyze({
        jobId: "client-route-job",
        file: new File(["image"], "rough.png", { type: "image/png" }),
        source: "file",
        width: 1,
        height: 1,
      }),
    ).rejects.toThrow("포즈 분석에 실패했습니다");
  });
});
