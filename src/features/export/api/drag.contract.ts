/**
 * 저장된 포즈 파일을 앱 창 밖으로 끌어놓는 계약(ADR-009, docs/12 §3).
 *
 * 목적지는 클립스튜디오 캔버스다. 우리는 OS 드래그를 시작시키는 일까지만 하고,
 * 파일을 읽어 포즈로 만드는 것은 클립스튜디오가 한다.
 */
export type DragOutcome =
  /** 다른 앱에 떨어뜨렸다. 클립스튜디오가 실제로 포즈를 적용했는지는 알 수 없다. */
  | "dropped"
  /** 사용자가 드래그를 도중에 놓았다. */
  | "cancelled";

export interface DragService {
  /**
   * 네이티브 드래그를 지원하는 환경인지. 브라우저 개발 모드에서는 false다.
   * false면 드래그 어피던스를 아예 보여주지 않는다.
   */
  readonly isSupported: boolean;

  /**
   * 파일 드래그를 시작한다. 반환 Promise는 **드래그가 시작되면** 이행되고,
   * 시작 자체가 실패하면 거부된다. 드롭·취소 결과는 `onEnd`로 온다.
   *
   * 파일은 항상 복사 모드로 넘긴다 — 원본이 저장 폴더에서 사라지면 안 된다
   * (CLAUDE.md §5 비파괴적 흐름).
   */
  startFileDrag(paths: string[], onEnd?: (outcome: DragOutcome) => void): Promise<void>;
}
