import { env } from "@/shared/lib/env";
import type { AnalyticsService } from "./analytics.contract";
import { analyticsMock } from "./analytics.mock";
import { analyticsHttp } from "./analytics.http";

/**
 * ⚠ `useMockApi`가 아니라 **`useMockPoseApi`**를 따른다.
 *
 * 선택 확정과 피드백은 분석 Job에 매달린 호출이라, 포즈가 Mock이면 jobId도 Mock이고
 * 실서버는 그런 job을 모른다. 두 스위치를 따로 두면 "포즈만 Mock" 조합에서 저장 흐름이
 * 확정 단계에서 막힌다 — 실제로 그렇게 막혔다.
 */
export const analyticsService: AnalyticsService =
  env.useMockPoseApi && !env.isProduction ? analyticsMock : analyticsHttp;
