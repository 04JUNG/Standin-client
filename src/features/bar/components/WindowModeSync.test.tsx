import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * 창 모드 전환이 캡처와 어긋나지 않는지 확인한다.
 *
 * 원래 캡처 대상(주 모니터 고정)과 오버레이 위치(창이 있던 모니터)가 서로 다른 곳에서
 * 정해졌다. 듀얼 모니터에서 A 모니터 사진이 B 모니터에 떠서 시연이 깨졌다. 두 값이
 * 같은 출처에서 나오는지를 여기서 묶어 둔다.
 */
const service = vi.hoisted(() => ({
  setMode: vi.fn(async () => {}),
  getPosition: vi.fn(async () => null),
  setPosition: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
  control: vi.fn(async () => {}),
}));

vi.mock("../api/windowMode.service", () => ({ windowModeService: service }));

const { WindowModeSync } = await import("./WindowModeSync");
const { useCaptureStore } = await import("@/features/capture/store/captureStore");
const { useWindowModeStore } = await import("../stores/windowModeStore");

const MONITOR = { x: 1920, y: 0, width: 2560, height: 1440 };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WindowModeSync />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  service.setMode.mockClear();
  useCaptureStore.getState().reset();
  useWindowModeStore.getState().setBarContentHeight(null);
});

afterEach(() => {
  useCaptureStore.getState().reset();
});

describe("WindowModeSync", () => {
  it("오버레이는 캡처한 모니터를 그대로 받는다", async () => {
    useCaptureStore.getState().setFrame({
      dataUrl: "data:image/png;base64,x",
      width: 2560,
      height: 1440,
      monitor: MONITOR,
    });

    renderAt("/app/capture");

    await waitFor(() => {
      expect(service.setMode).toHaveBeenCalledWith("overlay", expect.anything(), MONITOR);
    });
  });

  it("프레임이 없으면 모니터를 지정하지 않는다", async () => {
    // 캡처를 거치지 않고 오버레이 경로로 직접 들어온 경우. 창을 엉뚱한 좌표로
    // 옮기느니 지금 있는 모니터를 덮는 편이 낫다.
    renderAt("/app/capture");

    await waitFor(() => {
      expect(service.setMode).toHaveBeenCalledWith("overlay", expect.anything(), undefined);
    });
  });

  it("오버레이가 아닌 모드에는 모니터를 넘기지 않는다", async () => {
    useCaptureStore.getState().setFrame({
      dataUrl: "data:image/png;base64,x",
      width: 2560,
      height: 1440,
      monitor: MONITOR,
    });

    renderAt("/bar/actions");

    await waitFor(() => {
      expect(service.setMode).toHaveBeenCalledWith("bar", expect.anything(), undefined);
    });
  });

  it("바 내용이 표보다 크면 창을 그만큼 키운다", async () => {
    // 창이 고정 크기라 오류 안내가 창 밖으로 잘려 아예 보이지 않았다(0.1.1-beta.5).
    // 사용자에게는 "버튼을 눌러도 아무 반응이 없는" 것으로 보인다.
    useWindowModeStore.getState().setBarContentHeight(200);
    renderAt("/bar/actions");

    await waitFor(() =>
      expect(service.setMode).toHaveBeenCalledWith(
        "bar",
        expect.objectContaining({ height: 200 }),
        undefined,
      ),
    );
  });

  it("내용이 표보다 작으면 표 높이를 지킨다", async () => {
    useWindowModeStore.getState().setBarContentHeight(10);
    renderAt("/bar/actions");

    await waitFor(() =>
      expect(service.setMode).toHaveBeenCalledWith(
        "bar",
        expect.objectContaining({ height: 88 }),
        undefined,
      ),
    );
  });
});
