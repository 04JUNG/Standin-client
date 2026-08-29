import { env } from "@/shared/lib/env";
import type { HistoryService } from "./history.contract";
import { historyMock } from "./history.mock";
import { historyHttp } from "./history.http";

/** pose.service.ts와 동일한 스위치 형태(docs/02 §7). */
export const historyService: HistoryService =
  env.useMockApi && !env.isProduction ? historyMock : historyHttp;
