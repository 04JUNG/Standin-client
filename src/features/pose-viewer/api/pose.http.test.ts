import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetApiClient, setAccessToken, setInstallationCredentials } from "@/shared/api/client";
import { env } from "@/shared/lib/env";
import { __resetAnalysisJobs, poseHttp } from "./pose.http";

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
    __resetAnalysisJobs();
    setAccessToken("access-token");
    setInstallationCredentials({ installationId: "inst_1", deviceToken: "device-token" });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetApiClient();
    __resetAnalysisJobs();
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
    // 폴링·결과·썸네일은 하나의 signal을 공유한다 — deadline 하나로 전부 끊긴다.
    const [creation, ...rest] = requestSignals;
    expect(rest.every((signal) => signal === rest[0])).toBe(true);
    // Job 생성만 별도 signal이다. 화면 이탈로 이 요청을 끊으면 서버가 이미 만든 Job의
    // jobId를 영영 모르게 되고, 그 Job이 동시 분석 슬롯을 잡은 채 남는다.
    expect(creation).not.toBe(rest[0]);
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

  // 취소는 폴링을 끊는다. 다만 Job 생성 요청은 끊지 않는다 — 끊으면 서버가 이미 만든
  // Job의 jobId를 모르게 되고, 그 Job이 동시 분석 슬롯을 잡은 채 남아 다음 시도를 막는다.
  it("React Query가 취소하면 진행 중인 폴링을 즉시 중단한다", async () => {
    const controller = new AbortController();
    let createSignal: AbortSignal | undefined;
    let pollSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      if (init?.method === "POST") {
        createSignal = signal;
        return Promise.resolve(
          jsonResponse({ jobId: "server-job", status: "queued", createdAt: "now" }, 202),
        );
      }
      pollSignal = signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(signal?.reason ?? new DOMException("Aborted", "AbortError")),
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

    // 폴링이 시작될 때까지 기다린 뒤 취소한다(= 사용자가 화면을 떠난다).
    await vi.waitFor(() => expect(pollSignal).toBeDefined());
    controller.abort();

    await assertion;
    expect(pollSignal?.aborted).toBe(true);
    expect(createSignal?.aborted).toBe(false);
  });

  it("배포로 유실된 Job(ABANDONED)은 별도 사유로 갈라낸다", async () => {
    // 러너가 프로세스 내 fire-and-forget이라 배포 중 Job이 유실될 수 있다. 서버가
    // 스위퍼로 ABANDONED를 남기므로, 추론 실패와 같은 사유로 뭉개지 않는다.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "abandoned-job", status: "queued", createdAt: "now" }, 202),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobId: "abandoned-job",
          status: "failed",
          createdAt: "now",
          updatedAt: "now",
          error: "ABANDONED",
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
    ).rejects.toMatchObject({ code: "ABANDONED" });
  });

  it("쿼터 초과(429)는 원인과 다음 사용 가능 시점을 담은 오류로 올라간다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "DAILY_QUOTA_EXCEEDED",
            message: "daily quota exceeded",
            details: {
              limit: 10,
              retryAfterSeconds: 39600,
              retryAt: "2026-08-15T00:00:00.000+09:00",
            },
            requestId: "req_1",
          },
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "39600" },
        },
      ),
    );

    await expect(
      poseHttp.analyze({
        jobId: "client-route-job",
        file: new File(["image"], "rough.png", { type: "image/png" }),
        source: "file",
        width: 1,
        height: 1,
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: "DAILY_QUOTA_EXCEEDED",
      retryAfterSeconds: 39600,
      details: { limit: 10 },
    });
  });
  // 릴리스 버그: 업로드 뒤 창을 최소화하면 "이미 진행 중인 분석이 있습니다"가 떴다.
  // 최소화는 작업 표시줄로 숨는 대신 라우트를 앱(/app/jobs/:id)에서 바(/bar/candidates)로
  // 바꾸고(ADR-008), 그 전환에서 React Query가 진행 중인 요청을 끊은 뒤 새 옵저버로
  // 다시 실행한다. 그때 Job을 새로 만들면 앞선 Job이 아직 동시 분석 슬롯을 쥐고 있어
  // 사용자가 자기 분석에 자기가 막힌다. 화면 job 하나에 서버 Job은 하나여야 한다.
  it("취소 뒤 같은 화면 job으로 다시 요청해도 Job을 새로 만들지 않고 이어서 폴링한다", async () => {
    const responses = [
      () => jsonResponse({ jobId: "server-job", status: "queued", createdAt: "now" }, 202),
      () =>
        jsonResponse({
          jobId: "server-job",
          status: "completed",
          createdAt: "now",
          updatedAt: "now",
          error: null,
        }),
      () =>
        jsonResponse({
          jobId: "server-job",
          notes: [],
          capabilities: { refine: false },
          candidatesByPerson: [
            { personIndex: 0, box: null, tags: {}, fallbackMode: "hard", candidates: [] },
          ],
        }),
    ];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      // 실제 fetch처럼 취소된 요청은 보내지 않는다.
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const next = responses.shift();
      if (!next) throw new Error("예상하지 못한 요청");
      return next();
    });

    const input = {
      jobId: "client-route-job",
      file: new File(["image"], "rough.png", { type: "image/png" }),
      source: "file" as const,
      width: 1,
      height: 1,
    };

    // 최소화 = 라우트 전환 = 쿼리 취소. 생성 요청은 이미 나갔고 서버는 Job을 만들었다.
    const cancelled = new AbortController();
    const interrupted = poseHttp.analyze({ ...input, signal: cancelled.signal });
    cancelled.abort(new DOMException("Aborted", "AbortError"));
    await expect(interrupted).rejects.toThrow();

    // 바 화면이 마운트되며 같은 화면 job으로 다시 분석을 요청한다.
    const result = await poseHttp.analyze({ ...input, signal: new AbortController().signal });

    expect(result.jobId).toBe("server-job");
    const created = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(created).toHaveLength(1);
  });
});
