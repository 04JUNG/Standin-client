/**
 * 라우트의 `:jobId`에는 두 종류가 섞여 들어온다.
 *
 * - 라이브 분석: `InputPreviewPage`·`BarProgressPage`가 만든 `crypto.randomUUID()`.
 *   서버 Job이 생기기 **전에** 필요하므로 클라이언트가 발급한다.
 * - 작업 기록에서 재진입: BFF가 발급한 Job id.
 *
 * BFF는 `job_${randomUUID()}` 형태로 만든다(app-server `jobs/store.ts`의 `insertJob`).
 * 클라이언트가 만드는 쪽은 접두사가 없으므로 두 흐름은 이 판별자 하나로 겹치지 않게
 * 나뉜다. 라우트를 나누지 않은 덕분에 쿼리 키·선택 상태·저장 흐름·바 모드 전환이
 * 전부 그대로 성립한다(ADR-012).
 */
export function isServerJobId(id: string | undefined): boolean {
  return typeof id === "string" && id.startsWith("job_");
}
