/**
 * 바 ↔ 앱 모드를 오갈 때 **같은 단계**에 대응하는 반대편 라우트(ADR-008).
 *
 * 흐름 상태(초안·jobId·후보 선택·저장 결과)는 스토어와 Query 캐시에 있어 두 모드가
 * 이미 공유한다. 전환에서 잃던 것은 "어디까지 왔는지"뿐이었다 — 확대가 늘 홈으로,
 * 접기가 늘 접힌 바로 갔다. 두 방향의 표를 한곳에 두어 왕복이 어긋나지 않게 한다.
 *
 * 바 셸(features/bar)과 앱 셸(shared/components/AppShell)이 모두 필요로 하므로
 * shared에 둔다 — shared는 features를 import하지 않는다.
 */

/**
 * 바 → 앱. `/bar/*`에서 앱 창을 열 때.
 *
 * jobId·초안은 호출부가 스토어에서 읽어 넘긴다(이 모듈은 순수 함수로 둔다).
 */
export function appRouteForBarPath(
  pathname: string,
  state: { jobId: string | null; hasDraft: boolean },
): string {
  const { jobId, hasDraft } = state;

  if (pathname === "/bar/save") return jobId ? `/app/jobs/${jobId}/save` : "/app/home";
  if (pathname === "/bar/candidates") return jobId ? `/app/jobs/${jobId}` : "/app/home";
  // 바는 미리보기를 건너뛰고 바로 분석에 들어간다. 아직 job이 없으면 앱의 미리보기가 대응 단계다.
  if (pathname === "/bar/progress") {
    if (jobId) return `/app/jobs/${jobId}`;
    return hasDraft ? "/app/preview" : "/app/home";
  }
  // 접힘·기본 동작 화면. 분석 전 초안이 남아 있으면 미리보기로 되돌린다.
  return hasDraft ? "/app/preview" : "/app/home";
}

/**
 * 앱 → 바.
 *
 * `idle`은 대응하는 바 단계가 없을 때 갈 곳이다. 최소화는 접힌 바(`/bar`)가,
 * "플로팅 바로 전환" 버튼은 바로 쓸 수 있는 동작 화면(`/bar/actions`)이 자연스럽다.
 */
export function barRouteForAppPath(
  pathname: string,
  idle: "/bar" | "/bar/actions" = "/bar",
): string {
  if (/^\/app\/jobs\/[^/]+\/save$/.test(pathname)) return "/bar/save";
  if (/^\/app\/jobs\/[^/]+$/.test(pathname)) return "/bar/candidates";
  // 미리보기에 대응하는 바 화면은 없다. 초안은 스토어에 남아 다시 펴면 이어진다.
  if (pathname === "/app/preview") return "/bar/actions";
  return idle;
}
