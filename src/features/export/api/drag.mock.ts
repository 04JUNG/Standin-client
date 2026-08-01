import type { DragService } from "./drag.contract";

/**
 * 브라우저 개발용. 웹뷰에서는 OS 드래그를 시작할 수 없다.
 *
 * `isSupported: false`라 UI가 드래그 어피던스를 보여주지 않으므로 startFileDrag는
 * 호출되지 않는다. 그래도 실수로 호출됐을 때 조용히 성공한 척하지 않도록 거부한다
 * (CLAUDE.md §10 "구현하지 않은 기능을 작동하는 것처럼 보이게 하지 않는다").
 */
export const dragMock: DragService = {
  isSupported: false,

  async startFileDrag(paths) {
    console.info(`[drag.mock] 네이티브 드래그는 데스크톱 앱에서만 동작합니다: ${paths.join(", ")}`);
    throw new Error("네이티브 드래그는 데스크톱 앱에서만 사용할 수 있습니다.");
  },
};
