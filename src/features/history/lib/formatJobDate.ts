/**
 * 목록에 쓸 시각 문구. 사용자 로캘의 현지 시각으로 보여준다.
 *
 * 오늘·어제는 시각만 남긴다 — 방금 한 작업의 날짜를 반복해 읽는 것은 도움이 되지 않고,
 * 목록에서 눈에 걸리는 것은 "몇 시에 했는지"다.
 *
 * `now`를 인자로 받는 이유는 테스트다. 내부에서 Date.now()를 부르면 자정 근처에서만
 * 깨지는 경계를 재현할 수 없다.
 */
export function formatJobDate(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const days = calendarDaysBetween(at, now);
  if (days === 0) return `오늘 ${time}`;
  if (days === 1) return `어제 ${time}`;

  // 해가 바뀌면 연도를 붙인다. 같은 해에는 군더더기다.
  const sameYear = at.getFullYear() === now.getFullYear();
  const date = at.toLocaleDateString(undefined, {
    year: sameYear ? undefined : "numeric",
    month: "long",
    day: "numeric",
  });
  return `${date} ${time}`;
}

/** 두 시각 사이의 **달력상** 일수. 24시간 단위가 아니다 — 23시와 01시는 하루 차이다. */
function calendarDaysBetween(at: Date, now: Date): number {
  const startOfAt = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((startOfNow - startOfAt) / 86_400_000);
}
