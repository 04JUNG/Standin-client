import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { UpdateBanner } from "./UpdateBanner";
import { useUpdateStore } from "../store/updateStore";

/**
 * 배너가 실제로 뜨는지 고정한다(ADR-011).
 *
 * 설정 화면에만 업데이트를 두면 대부분의 사용자는 새 버전이 나온 줄 모른다. 전역
 * 단축키 실패가 설정 화면에만 있어서 시연 내내 아무도 몰랐던 전례가 있다.
 */
function renderBanner() {
  return render(createElement(MemoryRouter, null, createElement(UpdateBanner)));
}

function setResult(result: Parameters<typeof useUpdateStore.setState>[0]) {
  useUpdateStore.setState(result);
}

afterEach(() => {
  useUpdateStore.getState().reset();
});

describe("UpdateBanner", () => {
  it("확인 전에는 아무것도 렌더하지 않는다", () => {
    renderBanner();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("최신이면 렌더하지 않는다", () => {
    setResult({ phase: "done", result: { kind: "up-to-date" } });
    renderBanner();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("피드가 없는 빌드에서는 렌더하지 않는다", () => {
    setResult({ phase: "done", result: { kind: "disabled" } });
    renderBanner();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("확인이 실패해도 배너로 알리지 않는다", () => {
    // 사용자가 요청하지 않은 확인이다. 설정 화면에서 직접 확인하면 그때 오류를 보여준다.
    setResult({ phase: "error", error: "업데이트 서버에 연결하지 못했습니다." });
    renderBanner();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("새 버전이 있으면 버전과 설정으로 가는 길을 보여준다", () => {
    setResult({ phase: "done", result: { kind: "available", version: "0.1.2" } });
    renderBanner();

    expect(screen.getByRole("status")).toHaveTextContent("새 버전 0.1.2");
    expect(screen.getByRole("button", { name: "업데이트 보기" })).toBeInTheDocument();
  });

  it("나중에를 누르면 사라진다", async () => {
    setResult({ phase: "done", result: { kind: "available", version: "0.1.2" } });
    renderBanner();

    await userEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
