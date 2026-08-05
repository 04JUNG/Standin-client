import { env } from "@/shared/lib/env";
import type { RefineService } from "./refine.contract";
import { refineMock } from "./refine.mock";
import { refineHttp } from "./refine.http";

/** pose.service.ts와 같은 스위치. 포즈 조회와 refine은 항상 같은 모드로 움직인다. */
export const refineService: RefineService =
  env.useMockPoseApi && !env.isProduction ? refineMock : refineHttp;
