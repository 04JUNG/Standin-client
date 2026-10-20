import { setAnalyticsConsent } from "@/features/analytics/analyticsClient";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeStorage } from "@/shared/lib/safeStorage";

const currentVersion = vi.fn();
const isConfigured = vi.fn();
const check = vi.fn();
const cached = vi.fn();
const download = vi.fn();
const install = vi.fn();
const relaunch = vi.fn();

vi.mock("../api/update.service", () => ({
  updateService: {
    currentVersion: () => currentVersion(),
    isConfigured: () => isConfigured(),
    check: () => check(),
    cached: () => cached(),
    download: (progress: unknown) => download(progress),
    install: () => install(),
    relaunch: () => relaunch(),
  },
}));

const { useUpdateStore, pendingUpdate, reportInstalledUpdate } = await import("./updateStore");

/**
 * 전송 계층을 HTTP로 고정한다. 이 테스트는 "이벤트가 큐에 남았다"로 기록을 확인하는데,
 * Mock 전송은 즉시 성공해 큐를 비워 버린다(테스트 환경은 useMockPoseApi 기본값이 true다).
 * fetch가 없는 jsdom에서 flush가 실패해 큐가 남는 것이 이 단언들의 전제다.
 */
vi.mock("@/features/analytics/api/analytics.service", async () => ({
  analyticsService: (await import("@/features/analytics/api/analytics.http")).analyticsHttp,
}));

const QUEUE_KEY = "standin.analytics.queue.v1";

type QueuedEvent = { name: string; properties: Record<string, unknown> };

function queued(): QueuedEvent[] {
  return JSON.parse(safeStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedEvent[];
}

beforeEach(() => {
  setAnalyticsConsent("test-consent");
  vi.clearAllMocks();
  safeStorage.removeItem(QUEUE_KEY);
  safeStorage.removeItem("standin.updates.installAttempt");
  useUpdateStore.getState().reset();
  currentVersion.mockResolvedValue("0.1.1-beta.2");
  isConfigured.mockResolvedValue(true);
  cached.mockResolvedValue(null);
  download.mockResolvedValue({ version: "0.1.2", attempted: false });
  install.mockResolvedValue(undefined);
  relaunch.mockResolvedValue(undefined);
});

describe("updateStore", () => {
  it("피드가 없는 빌드에서는 확인 요청을 보내지 않는다", async () => {
    isConfigured.mockResolvedValue(false);

    await useUpdateStore.getState().check("manual");

    expect(check).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().phase).toBe("idle");
    // 버전은 피드와 무관하게 채워야 설정 화면이 표시할 수 있다.
    expect(useUpdateStore.getState().version).toBe("0.1.1-beta.2");
  });

  it("확인 결과를 담아 배너와 설정 화면이 같은 값을 본다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });

    await useUpdateStore.getState().check("manual");

    expect(useUpdateStore.getState().phase).toBe("done");
    expect(pendingUpdate(useUpdateStore.getState())).toEqual({
      version: "0.1.2",
      notes: undefined,
    });
  });

  it("loadInfo는 두 번 조회하지 않는다", async () => {
    await useUpdateStore.getState().loadInfo();
    await useUpdateStore.getState().loadInfo();

    expect(isConfigured).toHaveBeenCalledTimes(1);
  });

  it("확인 실패를 삼키지 않는다", async () => {
    check.mockRejectedValue(new Error("업데이트 서버에 연결하지 못했습니다."));

    await useUpdateStore.getState().check("manual");

    expect(useUpdateStore.getState().phase).toBe("error");
    expect(useUpdateStore.getState().error).toBe(
      "새 버전 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.",
    );
  });

  it("닫은 배너는 다음 확인에서 되살아난다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    await useUpdateStore.getState().check("manual");
    useUpdateStore.getState().dismissBanner();
    expect(pendingUpdate(useUpdateStore.getState())).toBeNull();

    // 다른 버전이 나왔는데 계속 숨어 있으면 안 된다.
    check.mockResolvedValue({ kind: "available", version: "0.1.3" });
    await useUpdateStore.getState().check("manual");

    expect(pendingUpdate(useUpdateStore.getState())?.version).toBe("0.1.3");
  });
  it("확인 결과를 지표로 남긴다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });

    await useUpdateStore.getState().check("startup");

    const events = queued().filter((e) => e.name === "update_check");
    expect(events).toHaveLength(1);
    // trigger를 갈라야 "시작 시 자동 확인이 실제로 도는가"에 답할 수 있다.
    expect(events[0].properties).toEqual({ trigger: "startup", result: "available" });
  });

  it("확인 실패는 사유 코드로만 남기고 오류 원문을 보내지 않는다", async () => {
    // 업데이터 오류에는 경로·호스트명이 섞일 수 있다(docs/11 §5).
    check.mockRejectedValue(new Error("failed to reach C:\\Users\\someone\\update"));

    await useUpdateStore.getState().check("manual");

    const names = queued().map((e) => e.name);
    expect(names).toContain("update_check");
    expect(names).toContain("update_failed");

    const failed = queued().find((e) => e.name === "update_failed")!;
    expect(failed.properties).toEqual({ phase: "check", reason: "UNKNOWN" });
    expect(JSON.stringify(queued())).not.toContain("someone");
  });

  it("발견한 업데이트를 자동으로 내려받지만 사용 중 설치하지 않는다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    await useUpdateStore.getState().check("startup");
    expect(download).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().installPhase).toBe("ready");
    expect(install).not.toHaveBeenCalled();
  });

  it("준비된 업데이트는 화면 진입 전에 한 번만 자동 설치한다", async () => {
    cached.mockResolvedValue({ version: "0.1.2", attempted: false });
    await Promise.all([
      useUpdateStore.getState().bootstrap(),
      useUpdateStore.getState().bootstrap(),
    ]);
    expect(install).toHaveBeenCalledTimes(1);
    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().startupComplete).toBe(false);
  });

  it("이전 설치가 실패한 버전을 다음 실행에서 자동 재설치하지 않는다", async () => {
    cached.mockResolvedValue({ version: "0.1.2", attempted: true });
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    download.mockResolvedValue({ version: "0.1.2", attempted: true });
    await useUpdateStore.getState().bootstrap();
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(install).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().startupComplete).toBe(true);
  });

  it("오프라인 설치 실패 후 기존 앱으로 진입한다", async () => {
    cached.mockResolvedValue({ version: "0.1.2", attempted: false });
    install.mockRejectedValue(new Error("network unavailable"));
    await useUpdateStore.getState().bootstrap();
    expect(useUpdateStore.getState().startupComplete).toBe(true);
    expect(relaunch).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it("설치 직전에 작업 상태를 다시 확인한다", async () => {
    useUpdateStore.setState({
      installPhase: "ready",
      cached: { version: "0.1.2", attempted: false },
    });
    await useUpdateStore.getState().install(() => "저장 중입니다.");
    expect(install).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().error).toBe("저장 중입니다.");
  });

  it("수동 확인과 자동 확인이 겹쳐도 한 번만 다운로드한다", async () => {
    let finish!: (value: { kind: "available"; version: string }) => void;
    check.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = useUpdateStore.getState().check("startup");
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    await useUpdateStore.getState().check("manual");
    finish({ kind: "available", version: "0.1.2" });
    await first;
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("다운로드 실패는 제한된 간격으로 재시도하고 수동 확인은 허용한다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    download.mockRejectedValue(new Error("network unavailable"));
    await useUpdateStore.getState().check("startup");
    await useUpdateStore.getState().check("reconnect");
    expect(check).toHaveBeenCalledTimes(1);
    await useUpdateStore.getState().check("manual");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it.each(["download", "install"] as const)(
    "%s 실패 시 내부 경로 대신 사용자 안내를 표시한다",
    async (phase) => {
      const failure = new Error("failed to write C:\\Users\\someone\\update.bin");
      if (phase === "download") {
        check.mockResolvedValue({ kind: "available", version: "0.1.2" });
        download.mockRejectedValue(failure);
        await useUpdateStore.getState().check("manual");
      } else {
        install.mockRejectedValue(failure);
        useUpdateStore.setState({
          installPhase: "ready",
          cached: { version: "0.1.2", attempted: false },
        });
        await useUpdateStore.getState().install(() => null);
      }
      expect(useUpdateStore.getState().error).toBe(
        phase === "download"
          ? "업데이트 파일을 내려받지 못했어요. 잠시 후 다시 시도해 주세요."
          : "업데이트를 설치하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      expect(JSON.stringify(queued())).not.toContain("someone");
      expect(relaunch).not.toHaveBeenCalled();
    },
  );

  it("피드가 없는 빌드는 지표도 남기지 않는다", async () => {
    // 브라우저 개발 모드가 집계를 오염시키면 안 된다.
    isConfigured.mockResolvedValue(false);

    await useUpdateStore.getState().check("startup");

    expect(queued()).toHaveLength(0);
  });

  it("설치 호출 성공이 아니라 새 바이너리 실행을 확인한 뒤 성공을 기록한다", async () => {
    useUpdateStore.setState({
      version: "0.1.1-beta.8",
      installPhase: "ready",
      cached: { version: "0.1.1-beta.9", attempted: false },
    });
    await useUpdateStore.getState().install(() => null);
    expect(queued().some((e) => e.name === "update_installed")).toBe(false);
    reportInstalledUpdate("0.1.1-beta.8", true);
    expect(queued().some((e) => e.name === "update_installed")).toBe(false);
    reportInstalledUpdate("0.1.1-beta.9", true);
    reportInstalledUpdate("0.1.1-beta.9", true);
    expect(queued().filter((e) => e.name === "update_installed")).toHaveLength(1);
  });
});
