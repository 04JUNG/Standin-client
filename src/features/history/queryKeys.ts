/**
 * ⚠ 루트 키를 `["analysis"]`와 **분리한다.**
 *
 * `AppUpdateSection`이 `useIsFetching({ queryKey: poseQueryKeys.all })`로 "분석이 도는 중"을
 * 판정해 앱 업데이트 설치를 미룬다(ADR-011). 기록 조회를 `["analysis", ...]` 아래 두면
 * 목록을 불러올 때마다 분석 중으로 오인돼 업데이트 버튼이 계속 비활성이 된다.
 */
export const historyQueryKeys = {
  all: ["jobHistory"] as const,
  list: () => ["jobHistory", "list"] as const,
  selections: (jobId: string) => ["jobHistory", "selections", jobId] as const,
};
