import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { endpoints } from "@/shared/api/endpoints";
import { FALLBACK_CATALOG } from "../lib/fallbackCatalog";
import type {
  ModelAvailability,
  ModelCatalog,
  ModelCatalogService,
  ModelCharacter,
  ModelGender,
  ModelSource,
} from "./models.contract";

/**
 * 모르는 값과 없는 값을 **안전한 쪽**으로 좁힌다(pose.http.ts의 `narrow`와 같은 규율).
 * 안전한 쪽 = 사용자에게 덜 약속하는 쪽이다 — 모르는 availability를 available로 읽으면
 * 만들 수 없는 체형을 고르게 하고, 그 결과는 기본 모델 FBX가 조용히 나오는 것이다.
 */
function narrow<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const GENDERS = ["male", "female", "unspecified"] as const satisfies readonly ModelGender[];
const AVAILABILITIES = ["available", "coming_soon"] as const satisfies readonly ModelAvailability[];
const SOURCES = ["builtin", "store", "user"] as const satisfies readonly ModelSource[];

type RawCharacter = Partial<Record<keyof ModelCharacter, unknown>>;
type RawCatalog = { characters?: unknown; defaultCharacterId?: unknown };

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCharacter(raw: RawCharacter): ModelCharacter | null {
  const characterId = text(raw.characterId);
  if (!characterId) return null;
  return {
    characterId,
    displayName: text(raw.displayName) ?? characterId,
    gender: narrow(GENDERS, raw.gender, "unspecified"),
    availability: narrow(AVAILABILITIES, raw.availability, "coming_soon"),
    source: narrow(SOURCES, raw.source, "builtin"),
    isDefault: raw.isDefault === true,
    rigProfile: text(raw.rigProfile),
    revision: text(raw.revision),
    previewUrl: text(raw.previewUrl),
    description: text(raw.description),
  };
}

/**
 * 기본 캐릭터를 고른다. 서버 값 → `isDefault` 표시 → 첫 항목 순으로 내려간다.
 * 기본값이 목록에 없으면 저장이 어떤 체형으로 나갈지 화면이 말할 수 없게 된다.
 */
function resolveDefaultId(characters: ModelCharacter[], raw: unknown): string {
  const declared = text(raw);
  if (declared && characters.some((item) => item.characterId === declared)) return declared;
  return (characters.find((item) => item.isDefault) ?? characters[0]!).characterId;
}

/**
 * "이 배포에는 모델 선택이 없다"를 뜻하는 상태들. 오류로 다루면 모델 화면이 통째로
 * 오류가 되어 **남성 기본 모델조차** 볼 수 없다. 네트워크 오류·5xx는 그대로 던져
 * 화면이 재시도를 보여주게 둔다.
 */
function meansNotDeployed(error: unknown): boolean {
  return error instanceof ApiError && [404, 501, 503].includes(error.status);
}

export const modelsHttp: ModelCatalogService = {
  async list({ signal }): Promise<ModelCatalog> {
    let raw: RawCatalog;
    try {
      raw = await apiFetch<RawCatalog>(endpoints.models.list, { auth: false, signal });
    } catch (error) {
      if (meansNotDeployed(error)) return FALLBACK_CATALOG;
      throw error;
    }

    const characters = (Array.isArray(raw.characters) ? raw.characters : [])
      .map((item) => toCharacter((item ?? {}) as RawCharacter))
      .filter((item): item is ModelCharacter => item !== null);

    // 아무것도 못 주는 서버는 변환도 못 한다. 빈 화면 대신 폴백을 보여준다.
    if (characters.length === 0) return FALLBACK_CATALOG;

    return {
      characters,
      defaultCharacterId: resolveDefaultId(characters, raw.defaultCharacterId),
      origin: "server",
    };
  },
};
