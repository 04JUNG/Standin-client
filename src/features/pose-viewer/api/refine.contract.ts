/**
 * 선택 후보 refine 계약. 서버 문서: Standin-app-server/docs/API.md
 *
 * 클라이언트는 `candidateId`만 보낸다. COCO-17 좌표와 안전정책은 BFF가 `/analyze` 때
 * 보관해 둔 값을 쓴다 — 클라가 되돌려 보내는 구조였다면 refine 금지를 우회할 수 있다.
 */
export type RefineOutcome = {
  personIndex: number;
  candidateId: string;
  /**
   * 조정본이 만들어졌는가.
   *
   * **false는 오류가 아니다.** 안전 게이트가 조정을 버리고 베이스를 유지한 정상 결과이며,
   * 이 경우에도 `exportUrl`은 정상적으로 저장 가능한 베이스 BVH를 가리킨다.
   */
  refined: boolean;
  /** 코드형 사유. 사용자에게는 그대로 보여주지 않고 문구로 번역한다(FE-04). */
  reasonCode: string;
  adjustedLimbs: string[];
  /** BFF가 확정한 최종 다운로드 경로. 미리보기와 저장이 같은 URL을 쓴다. */
  exportUrl: string;
};

export interface RefineService {
  refineSelection(input: {
    jobId: string;
    personIndex: number;
    candidateId: string;
  }): Promise<RefineOutcome>;
}
