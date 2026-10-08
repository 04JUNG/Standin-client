import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import type { WindowModeService, WindowPosition, WindowSize } from "../api/windowMode.contract";
import { BAR_SIZES } from "../lib/barSizes";

/**
 * 창 모드 전환이 캡처와 어긋나지 않는지 확인한다.
 *
 * 원래 캡처 대상(주 모니터 고정)과 오버레이 위치(창이 있던 모니터)가 서로 다른 곳에서
 * 정해졌다. 듀얼 모니터에서 A 모니터 사진이 B 모니터에 떠서 시연이 깨졌다. 두 값이
 * 같은 출처에서 나오는지를 여기서 묶어 둔다.
 */
const service = vi.hoisted(() => ({
  setMode: vi.fn<WindowModeService["setMode"]>(),
  getPosition: vi.fn<WindowModeService["getPosition"]>(),
  setPosition: vi.fn<WindowModeService["setPosition"]>(),
  startDragging: vi.fn(async () => {}),
  control: vi.fn(async () => {}),
}));

vi.mock("../api/windowMode.service", () => ({ windowModeService: service }));

const { WindowModeSync } = await import("./WindowModeSync");
const { useCaptureStore } = await import("@/features/capture/store/captureStore");
const { useWindowModeStore } = await import("../stores/windowModeStore");

const MONITOR = { x: 1920, y: 0, width: 2560, height: 1440 };

/**
 * 가짜 창. Rust와 같이 크기를 바꾸면 좌상단을 지키고, 화면 밖으로 나가면 작업 영역
 * 안으로 민다(window_mode.rs clamp_into_monitor). 사용자의 끌기는 `windowAt`을 직접
 * 바꿔 흉내 낸다.
 */
const SCREEN = { width: 1920, height: 1080 };
let windowAt: WindowPosition;

function clamp(position: WindowPosition, size: WindowSize): WindowPosition {
  return {
    x: Math.min(Math.max(position.x, 0), Math.max(SCREEN.width - size.width, 0)),
    y: Math.min(Math.max(position.y, 0), Math.max(SCREEN.height - size.height, 0)),
  };
}

let navigateTo: (path: string) => void = () => {};

function Navigator() {
  const navigate = useNavigate();
  navigateTo = (path) => navigate(path);
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WindowModeSync />
      <Navigator />
    </MemoryRouter>,
  );
}

/** 창 조작 줄이 모두 끝날 때까지 기다린다. 가짜 창은 전부 즉시 끝난다. */
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function go(path: string) {
  act(() => navigateTo(path));
  await settle();
}

async function setContentHeight(height: number | null) {
  act(() => useWindowModeStore.getState().setBarContentHeight(height));
  await settle();
}

beforeEach(() => {
  windowAt = { x: 200, y: 200 };
  service.setMode.mockReset().mockImplementation(async (_mode, size) => {
    if (size) windowAt = clamp(windowAt, size);
  });
  service.setPosition.mockReset().mockImplementation(async (position, size) => {
    windowAt = clamp(position, size);
  });
  service.getPosition.mockReset().mockImplementation(async () => ({ ...windowAt }));
  useCaptureStore.getState().reset();
  useWindowModeStore.getState().reset();
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
        expect.objectContaining({ height: BAR_SIZES.actions.height }),
        undefined,
      ),
    );
  });
});

/**
 * 바 위치. 종전에는 바를 떠날 때만 위치를 갈무리하고 크기가 바뀔 때마다 그 자리로
 * 되돌렸다. 바 안에서 끌어 옮긴 뒤 후보·인물을 넘기면(내용 높이가 바뀌면) 창이 옛
 * 자리로 튀었다.
 */
describe("WindowModeSync 바 위치", () => {
  it("후보를 넘겨 내용 높이만 바뀌면 사용자가 옮긴 창을 건드리지 않는다", async () => {
    useWindowModeStore.getState().setBarPosition({ x: 200, y: 200 });
    renderAt("/bar/candidates");
    await settle();
    expect(windowAt).toEqual({ x: 200, y: 200 });

    windowAt = { x: 900, y: 500 }; // 사용자가 끌어 옮긴다.
    service.setMode.mockClear();
    service.setPosition.mockClear();

    // 인물·후보마다 내용 높이가 다르지만 둘 다 표 높이(460) 안이다.
    await setContentHeight(380);
    await setContentHeight(420);

    expect(windowAt).toEqual({ x: 900, y: 500 });
    expect(service.setMode).not.toHaveBeenCalled();
    expect(service.setPosition).not.toHaveBeenCalled();
  });

  it("내용이 넘쳐 창이 커져도 사용자가 옮긴 자리를 지킨다", async () => {
    useWindowModeStore.getState().setBarPosition({ x: 200, y: 200 });
    renderAt("/bar/candidates");
    await settle();

    windowAt = { x: 900, y: 400 };
    await setContentHeight(520);

    expect(service.setMode).toHaveBeenLastCalledWith(
      "bar",
      { width: BAR_SIZES.candidates.width, height: 520 },
      undefined,
    );
    expect(windowAt).toEqual({ x: 900, y: 400 });
    expect(useWindowModeStore.getState().barPosition).toEqual({ x: 900, y: 400 });
  });

  it("바 화면이 바뀌어도 사용자가 옮긴 자리에서 이어 뜬다", async () => {
    useWindowModeStore.getState().setBarPosition({ x: 200, y: 200 });
    renderAt("/bar/candidates");
    await settle();

    windowAt = { x: 900, y: 400 };
    await go("/bar/review");

    expect(windowAt).toEqual({ x: 900, y: 400 });
  });

  it("화면 가장자리에서 밀린 자리는 기준으로 삼지 않는다", async () => {
    // 오른쪽 아래 구석. 큰 후보 화면은 안쪽으로 밀리지만, 작은 화면으로 돌아오면
    // 사용자가 둔 자리로 돌아가야 한다.
    useWindowModeStore.getState().setBarPosition({ x: 1500, y: 950 });
    renderAt("/bar/actions");
    await settle();
    expect(windowAt).toEqual({ x: 1500, y: 950 });

    await go("/bar/candidates");
    expect(windowAt).toEqual({ x: 1200, y: 620 });

    await go("/bar/actions");
    expect(windowAt).toEqual({ x: 1500, y: 950 });
    expect(useWindowModeStore.getState().barPosition).toEqual({ x: 1500, y: 950 });
  });

  it("바를 떠날 때 옮긴 자리를 갈무리하고 돌아오면 그 자리에 뜬다", async () => {
    useWindowModeStore.getState().setBarPosition({ x: 200, y: 200 });
    renderAt("/bar/actions");
    await settle();

    windowAt = { x: 700, y: 300 };
    await go("/app/home");
    expect(useWindowModeStore.getState().barPosition).toEqual({ x: 700, y: 300 });

    windowAt = { x: 100, y: 100 }; // 앱 창은 어디에 있든 상관없다.
    await go("/bar");
    expect(windowAt).toEqual({ x: 700, y: 300 });
  });

  it("처음 바를 열면 놓인 자리를 기준으로 삼는다", async () => {
    renderAt("/bar/actions");
    await settle();

    expect(service.setPosition).not.toHaveBeenCalled();
    expect(useWindowModeStore.getState().barPosition).toEqual({ x: 200, y: 200 });
  });
});
