import type { ModelCatalog, ModelCatalogService } from "./models.contract";

/**
 * 개발용 카탈로그. 잠긴 분기(`coming_soon`)를 하나 넣는다 — 넣지 않으면 "준비 중" 카드가
 * 어떻게 보이는지 실서버가 붙기 전까지 아무도 확인할 수 없다(pose.mock.ts와 같은 판단).
 */
const MOCK_CATALOG: ModelCatalog = {
  origin: "server",
  defaultCharacterId: "standin-master-v2",
  characters: [
    {
      characterId: "standin-master-v2",
      displayName: "기본 남성",
      gender: "male",
      availability: "available",
      source: "builtin",
      isDefault: true,
      rigProfile: "mixamo",
      revision: "v2",
      previewUrl: null,
      description: "표준 남성 체형입니다.",
    },
    {
      characterId: "standin-female-v2-lbs",
      displayName: "기본 여성",
      gender: "female",
      availability: "available",
      source: "builtin",
      isDefault: false,
      rigProfile: "mixamo",
      revision: "v2",
      previewUrl: null,
      description: "표준 여성 체형입니다.",
    },
    {
      characterId: "standin-teen-v1",
      displayName: "청소년",
      gender: "unspecified",
      availability: "coming_soon",
      source: "builtin",
      isDefault: false,
      rigProfile: "mixamo",
      revision: "v1",
      previewUrl: null,
      description: null,
    },
  ],
};

export const modelsMock: ModelCatalogService = {
  async list(): Promise<ModelCatalog> {
    return MOCK_CATALOG;
  },
};
