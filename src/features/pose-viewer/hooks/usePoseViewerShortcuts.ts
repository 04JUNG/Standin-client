import { useShortcuts } from "@/shared/hooks/useShortcuts";

/**
 * 포즈 후보 뷰어 단축키(docs/04 §13).
 *
 * 별도 파일로 둔 이유: 후보 순차 탐색(↑/↓)과 후보 번호 선택(1~5)은 다른 담당자의
 * 워크스트림("단축키 모드 순차 탐색")이다. 그쪽 작업과 같은 페이지를 건드리므로
 * 호출 지점을 한 줄로 유지해 병합 충돌 면적을 줄인다.
 */
export function usePoseViewerShortcuts(params: {
  /** 후보를 모두 선택했는가. 아니면 확정 키를 비활성한다. */
  canConfirm: boolean;
  onConfirm: () => void;
}): void {
  const { canConfirm, onConfirm } = params;

  useShortcuts({
    // 화면의 버튼과 같은 조건으로 막는다 — 단축키가 disabled 버튼을 우회하지 않게.
    "poseViewer.confirm": canConfirm ? () => onConfirm() : undefined,
  });
}
