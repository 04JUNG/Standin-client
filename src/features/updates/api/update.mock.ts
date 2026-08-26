import type { UpdateService } from "./update.contract";

/**
 * 브라우저 개발용. 웹뷰에는 업데이트할 실행 파일이 없다.
 *
 * `isConfigured: false`라 UI가 확인 버튼을 그리지 않는다. 그래도 실수로 호출됐을 때
 * 성공한 척하지 않는다(CLAUDE.md §10).
 */
export const updateMock: UpdateService = {
  async currentVersion() {
    // 데스크톱이 아니면 번들 버전을 알 수 없다. Vite가 주입하는 값도 없으므로
    // 버전 대신 개발 모드임을 밝힌다.
    return "개발 모드";
  },

  async isConfigured() {
    return false;
  },

  async check() {
    return { kind: "disabled" };
  },

  async install() {
    throw new Error("자동 업데이트는 데스크톱 앱에서만 사용할 수 있습니다.");
  },

  async relaunch() {
    throw new Error("자동 업데이트는 데스크톱 앱에서만 사용할 수 있습니다.");
  },
};
