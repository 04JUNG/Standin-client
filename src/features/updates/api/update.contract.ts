/**
 * 자동 업데이트 계약(ADR-011).
 *
 * 앱은 업데이트 여부만 묻고, 실제 검증(minisign 서명)과 설치는 Tauri updater
 * 플러그인이 한다. 서버·번들 쪽 사정을 프론트가 알 필요가 없도록 결과를 세 가지
 * 상태로만 좁힌다.
 */

export type UpdateAvailability =
  /** 이 빌드에 업데이트 피드가 없다. 브라우저 개발 모드와 Standin Dev가 여기 해당한다. */
  | { kind: "disabled" }
  /** 확인했고 최신이다. */
  | { kind: "up-to-date" }
  /** 새 버전이 있다. */
  | { kind: "available"; version: string; notes?: string };

/**
 * 내려받기 진행률. 서버가 Content-Length를 주지 않으면 비율을 알 수 없으므로
 * null이 온다 — 이때 UI는 퍼센트 대신 불확정 표시를 써야 한다.
 */
export type DownloadProgress = { ratio: number | null };

export interface UpdateService {
  /** 지금 실행 중인 앱 버전. 피드 설정 여부와 무관하게 항상 답한다. */
  currentVersion(): Promise<string>;

  /**
   * 이 빌드가 자동 업데이트를 쓸 수 있는지. false면 업데이트 확인 UI를 아예
   * 보여주지 않는다(CLAUDE.md §10).
   */
  isConfigured(): Promise<boolean>;

  /** 업데이트를 확인한다. 피드가 없으면 `disabled`를 돌려준다. */
  check(): Promise<UpdateAvailability>;

  /**
   * 직전 `check()`가 찾은 업데이트를 내려받아 설치한다. 찾은 업데이트가 없는데
   * 호출하면 거부된다. 설치는 재시작해야 적용된다.
   */
  install(onProgress?: (progress: DownloadProgress) => void): Promise<void>;

  /** 앱을 재시작한다. 설치 직후에만 호출한다. */
  relaunch(): Promise<void>;
}
