import { env } from "@/shared/lib/env";
import type { ModelCatalogService } from "./models.contract";
import { modelsMock } from "./models.mock";
import { modelsHttp } from "./models.http";

/** history.service.ts와 동일한 스위치 형태(docs/02 §7). */
export const modelsService: ModelCatalogService =
  env.useMockApi && !env.isProduction ? modelsMock : modelsHttp;
