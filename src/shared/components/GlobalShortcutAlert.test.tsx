import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GlobalShortcutAlert, GlobalShortcutIndicator } from "./GlobalShortcutAlert";
import { useShortcutStore } from "@/shared/stores/shortcutStore";

/**
 * 전역 단축키 등록 실패가 실제로 화면에 나오는지 확인한다.
 *
 * 이 경고가 없던 시절, 등록 실패가 store에만 남고 설정 화면에서만 보여서 시연 내내
 * 아무도 단축키가 죽은 줄 몰랐다. 회귀하면 같은 일이 반복되므로 테스트로 묶는다.
 */
function renderAlert() {
  return render(
    <MemoryRouter>
      <GlobalShortcutAlert />
    </MemoryRouter>,
  );
}

afterEach(() => {
  useShortcutStore.getState().reset();
});

describe("GlobalShortcutAlert", () => {
  it("등록에 실패하면 사유와 대체 경로를 알린다", () => {
    useShortcutStore
      .getState()
      .setGlobalStatus("failed", "다른 프로그램이 이미 이 단축키를 사용하고 있습니다.");
    renderAlert();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("전역 단축키가 등록되지 않았습니다.");
    expect(alert).toHaveTextContent("다른 프로그램이 이미 이 단축키를 사용하고 있습니다.");
    // 지금 무엇이 되는지도 함께 말해야 사용자가 막히지 않는다.
    expect(alert).toHaveTextContent("Standin 창이 활성일 때만");
    expect(screen.getByRole("button", { name: "단축키 변경" })).toBeInTheDocument();
  });

  it("등록에 성공하면 아무것도 렌더하지 않는다", () => {
    useShortcutStore.getState().setGlobalStatus("registered");
    renderAlert();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("브라우저 개발 모드(unavailable)에서는 경고하지 않는다", () => {
    // 사용자가 할 수 있는 일이 없다. 치트시트와 설정 화면이 이미 설명한다.
    useShortcutStore.getState().setGlobalStatus("unavailable", "브라우저 개발 모드입니다.");
    renderAlert();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("등록 중에는 경고하지 않는다", () => {
    useShortcutStore.getState().setGlobalStatus("registering");
    renderAlert();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("GlobalShortcutIndicator", () => {
  it("실패했을 때만 바에 경고 버튼을 띄운다", () => {
    useShortcutStore.getState().setGlobalStatus("failed", "등록 실패");
    const { unmount } = render(
      <MemoryRouter>
        <GlobalShortcutIndicator />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /전역 단축키가 등록되지 않았습니다/ })).toBeInTheDocument();
    unmount();

    useShortcutStore.getState().setGlobalStatus("registered");
    render(
      <MemoryRouter>
        <GlobalShortcutIndicator />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
