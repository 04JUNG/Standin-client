/**
 * 모델(캐릭터) 카탈로그 계약. BFF `GET /v1/models` (docs/08 §8-1).
 *
 * 여기서 말하는 "모델"은 저장될 FBX의 **체형**이다. 앱은 FBX를 만들지 않는다 — BFF가
 * converter에 `character_id`를 넘겨 리깅된 결과를 받아 내려준다. 그래서 이 값은 분석
 * 요청이 아니라 **저장(export) 파라미터**다(ADR-013).
 */

export type ModelGender = "male" | "female" | "unspecified";

/**
 * 지금 실제로 만들 수 있는가. 등록은 됐지만 artifact가 아직 배포되지 않은 캐릭터는
 * `coming_soon`으로 온다 — 목록에서 빼면 "기능이 없다"로 읽히기 때문이다.
 */
export type ModelAvailability = "available" | "coming_soon";

/** 어디서 온 모델인가. 지금은 builtin뿐이고 에셋 스토어·모델 불러오기가 여기로 붙는다. */
export type ModelSource = "builtin" | "store" | "user";

export type ModelCharacter = {
  /**
   * converter의 `character_id` 원문. **클라이언트는 이 문자열을 절대 해석하지 않는다** —
   * 성별이나 종류를 id에서 유추하는 순간 새 모델이 들어올 때마다 흐름 코드를 고쳐야 한다.
   */
  characterId: string;
  displayName: string;
  /** 카탈로그 UI의 라벨·정렬에만 쓴다. 흐름 코드가 이 값으로 분기하지 않는다. */
  gender: ModelGender;
  availability: ModelAvailability;
  source: ModelSource;
  isDefault: boolean;
  rigProfile: string | null;
  revision: string | null;
  /** 서버가 주는 인증 필요 상대 경로. 없으면 앱이 커밋한 PNG를 쓴다. */
  previewUrl: string | null;
  description: string | null;
};

export type ModelCatalog = {
  characters: ModelCharacter[];
  defaultCharacterId: string;
  /**
   * 이 목록의 출처. `"fallback"`이면 서버가 `/v1/models`를 모르는 배포다 — 그 배포에서는
   * 기본 모델 말고 아무것도 고를 수 없고, 화면이 그 사실을 알려야 한다.
   */
  origin: "server" | "fallback";
};

export interface ModelCatalogService {
  list(input: { signal?: AbortSignal }): Promise<ModelCatalog>;
}
