/**
 * ⚠ 루트 키를 `["analysis"]`와 **분리한다.**
 *
 * `AppUpdateSection`이 `useIsFetching({ queryKey: poseQueryKeys.all })`로 "분석이 도는 중"을
 * 판정해 앱 업데이트 설치를 미룬다(ADR-011). 모델 목록 조회를 `["analysis", ...]` 아래 두면
 * 카탈로그를 불러올 때마다 분석 중으로 오인돼 업데이트 버튼이 계속 비활성이 된다.
 * (historyQueryKeys에 같은 경고가 있다.)
 */
export const modelQueryKeys = {
  all: ["models"] as const,
  catalog: () => ["models", "catalog"] as const,
};
