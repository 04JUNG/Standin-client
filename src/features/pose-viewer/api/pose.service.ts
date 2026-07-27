import { env } from "@/shared/lib/env";
import type { PoseResultService } from "./pose.contract";
import { poseMock } from "./pose.mock";
import { poseHttp } from "./pose.http";

/** auth.service.ts와 동일한 스위치 형태(docs/02 §7). 포즈 서버는 useMockPoseApi로 별도 전환 가능. */
export const poseService: PoseResultService = env.useMockPoseApi && !env.isProduction ? poseMock : poseHttp;
