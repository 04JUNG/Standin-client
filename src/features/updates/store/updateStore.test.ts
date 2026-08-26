import { beforeEach, describe, expect, it, vi } from "vitest";

const currentVersion = vi.fn();
const isConfigured = vi.fn();
const check = vi.fn();

vi.mock("../api/update.service", () => ({
  updateService: {
    currentVersion: () => currentVersion(),
    isConfigured: () => isConfigured(),
    check: () => check(),
    install: vi.fn(),
    relaunch: vi.fn(),
  },
}));

const { useUpdateStore, pendingUpdate } = await import("./updateStore");

beforeEach(() => {
  vi.clearAllMocks();
  useUpdateStore.getState().reset();
  currentVersion.mockResolvedValue("0.1.1-beta.2");
  isConfigured.mockResolvedValue(true);
});

describe("updateStore", () => {
  it("피드가 없는 빌드에서는 확인 요청을 보내지 않는다", async () => {
    isConfigured.mockResolvedValue(false);

    await useUpdateStore.getState().check();

    expect(check).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().phase).toBe("idle");
    // 버전은 피드와 무관하게 채워야 설정 화면이 표시할 수 있다.
    expect(useUpdateStore.getState().version).toBe("0.1.1-beta.2");
  });

  it("확인 결과를 담아 배너와 설정 화면이 같은 값을 본다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });

    await useUpdateStore.getState().check();

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

    await useUpdateStore.getState().check();

    expect(useUpdateStore.getState().phase).toBe("error");
    expect(useUpdateStore.getState().error).toBe("업데이트 서버에 연결하지 못했습니다.");
  });

  it("닫은 배너는 다음 확인에서 되살아난다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    await useUpdateStore.getState().check();
    useUpdateStore.getState().dismissBanner();
    expect(pendingUpdate(useUpdateStore.getState())).toBeNull();

    // 다른 버전이 나왔는데 계속 숨어 있으면 안 된다.
    check.mockResolvedValue({ kind: "available", version: "0.1.3" });
    await useUpdateStore.getState().check();

    expect(pendingUpdate(useUpdateStore.getState())?.version).toBe("0.1.3");
  });
});
