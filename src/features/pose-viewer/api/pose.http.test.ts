import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetApiClient, setAccessToken, setInstallationCredentials } from "@/shared/api/client";
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
    vi.useRealTimers();
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
    const requestSignals = fetchMock.mock.calls.map(
      (call) => (call[1] as RequestInit).signal as AbortSignal,
    );
    expect(requestSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(requestSignals.every((signal) => signal === requestSignals[0])).toBe(true);
    // 이 fixture에는 품질 필드가 없다 = 구 BFF와의 순차 배포 창(E2E-12).
    // 그때 낙관적으로 해석하면 저정보 결과가 경고 없이 일반 후보처럼 보인다.
    expect(result).toEqual({
      jobId: "server-job",
      capabilities: { refine: false },
      people: [
        {
          index: 0,
          confidence: "low",
          skeletonState: "invalid",
          skeletonSource: "none",
          coverageClass: "insufficient",
          fallbackMode: "soft",
          refineAllowed: false,
          refinableLimbs: [],
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

  it("품질 신호와 refine capability를 그대로 읽는다", async () => {
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
          capabilities: { refine: true },
          candidatesByPerson: [
            {
              personIndex: 0,
              box: null,
              tags: {},
              confidence: "high",
              skeletonState: "valid",
              skeletonSource: "full_image",
              coverageClass: "full",
              fallbackMode: "none",
              refineAllowed: true,
              refinableLimbs: ["left_arm"],
              candidates: [
                {
                  id: "p::front",
                  poseId: "p",
                  rank: 1,
                  view: "front",
                  tags: [],
                  matchLevel: "high",
                  bvhAvailable: true,
                },
              ],
            },
            // hard fallback — 후보가 없는 인물. 위 인물의 흐름은 계속 진행돼야 한다.
            {
              personIndex: 1,
              box: null,
              tags: {},
              confidence: "low",
              skeletonState: "missing",
              skeletonSource: "none",
              coverageClass: "insufficient",
              fallbackMode: "hard",
              refineAllowed: false,
              refinableLimbs: [],
              candidates: [],
            },
          ],
        }),
      );

    const result = await poseHttp.analyze({
      jobId: "client-route-job",
      file: new File(["image"], "rough.png", { type: "image/png" }),
      source: "file",
      width: 1,
      height: 1,
    });

    expect(result.capabilities.refine).toBe(true);
    expect(result.people[0]).toMatchObject({
      confidence: "high",
      skeletonState: "valid",
      skeletonSource: "full_image",
      coverageClass: "full",
      fallbackMode: "none",
      refineAllowed: true,
      refinableLimbs: ["left_arm"],
    });
    expect(result.people[1]).toMatchObject({ fallbackMode: "hard", refineAllowed: false });
    // 서버 personIndex를 그대로 쓴다 — 화면에서 탐지 순서로 다시 번호를 매기지 않는다.
    expect(result.people.map((p) => p.index)).toEqual([0, 1]);
  });

  it("모르는 값은 안전한 쪽으로 좁힌다", async () => {
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
              box: null,
              tags: {},
              confidence: "excellent",
              coverageClass: "mostly",
              // 후보가 있는데 hard라고 오면 화면이 후보를 통째로 숨긴다 → soft로 낮춘다.
              fallbackMode: "hard",
              candidates: [
                {
                  id: "p::front",
                  poseId: "p",
                  rank: 1,
                  view: "front",
                  tags: [],
                  matchLevel: "high",
                  bvhAvailable: true,
                },
              ],
            },
          ],
        }),
      );

    const result = await poseHttp.analyze({
      jobId: "client-route-job",
      file: new File(["image"], "rough.png", { type: "image/png" }),
      source: "file",
      width: 1,
      height: 1,
    });

    expect(result.people[0]).toMatchObject({
      confidence: "low",
      coverageClass: "insufficient",
      fallbackMode: "soft",
      refineAllowed: false,
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

  it("응답이 없는 HTTP 요청을 전체 Job deadline에 실제로 중단한다", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason ?? new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const pending = poseHttp.analyze({
      jobId: "client-route-job",
      file: new File(["image"], "rough.png", { type: "image/png" }),
      source: "file",
      width: 1,
      height: 1,
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    await assertion;
    expect(requestSignal?.aborted).toBe(true);
  });

  it("React Query가 취소하면 진행 중인 HTTP 요청도 즉시 중단한다", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason ?? new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const pending = poseHttp.analyze({
      jobId: "client-route-job",
      file: new File(["image"], "rough.png", { type: "image/png" }),
      source: "file",
      width: 1,
      height: 1,
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });

    controller.abort();

    await assertion;
    expect(requestSignal?.aborted).toBe(true);
  });
});
