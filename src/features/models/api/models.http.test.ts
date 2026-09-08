import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { modelsHttp } from "./models.http";
import { FALLBACK_DEFAULT_ID } from "../lib/fallbackCatalog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number): Response {
  return jsonResponse({ error: { code: "NOT_FOUND", message: "no" } }, status);
}

function serverCharacter(overrides: Record<string, unknown> = {}) {
  return {
    characterId: "standin-master-v2",
    displayName: "기본 남성",
    gender: "male",
    availability: "available",
    source: "builtin",
    isDefault: true,
    rigProfile: "mixamo",
    revision: "v2",
    previewUrl: null,
    description: null,
    ...overrides,
  };
}

describe("modelsHttp.list", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetApiClient();
    setInstallationCredentials({ installationId: "inst_1", deviceToken: "device-token" });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiClient();
  });

  // 이 엔드포인트를 모르는 배포에서 화면이 통째로 오류가 되면 기본 남성 모델조차 못 본다.
  it.each([404, 501, 503])("%i는 '이 배포엔 없다'로 보고 폴백한다", async (status) => {
    fetchMock.mockResolvedValue(errorResponse(status));

    const catalog = await modelsHttp.list({});

    expect(catalog.origin).toBe("fallback");
    expect(catalog.defaultCharacterId).toBe(FALLBACK_DEFAULT_ID);
    // 여성 카드는 보이되 잠겨 있어야 한다 — 고를 수 있으면 남성 FBX가 조용히 저장된다.
    const female = catalog.characters.find((item) => item.gender === "female");
    expect(female?.availability).toBe("coming_soon");
  });

  it("네트워크 오류와 5xx는 그대로 던진다 — 화면이 재시도를 보여줘야 한다", async () => {
    fetchMock.mockResolvedValue(errorResponse(500));
    await expect(modelsHttp.list({})).rejects.toBeTruthy();
  });

  it("빈 목록은 폴백으로 본다 — 아무것도 못 주는 서버는 변환도 못 한다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ characters: [] }));
    expect((await modelsHttp.list({})).origin).toBe("fallback");
  });

  it("모르는 값은 덜 약속하는 쪽으로 좁힌다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        characters: [
          serverCharacter({
            characterId: "mystery",
            gender: "robot",
            availability: "maybe",
            source: "marketplace",
            isDefault: "yes",
          }),
        ],
      }),
    );

    const [character] = (await modelsHttp.list({})).characters;

    expect(character).toMatchObject({
      gender: "unspecified",
      availability: "coming_soon",
      source: "builtin",
      isDefault: false,
    });
  });

  it("characterId가 없는 항목은 버린다 — 주소로 쓸 수 없는 모델이다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ characters: [{ displayName: "이름만 있음" }, serverCharacter()] }),
    );

    const catalog = await modelsHttp.list({});
    expect(catalog.characters).toHaveLength(1);
    expect(catalog.characters[0]!.characterId).toBe("standin-master-v2");
  });

  it("기본값은 서버 값 → isDefault → 첫 항목 순으로 정한다", async () => {
    const rows = [
      serverCharacter({ characterId: "a", isDefault: false }),
      serverCharacter({ characterId: "b", isDefault: true }),
    ];

    fetchMock.mockResolvedValue(jsonResponse({ characters: rows, defaultCharacterId: "a" }));
    expect((await modelsHttp.list({})).defaultCharacterId).toBe("a");

    // 목록에 없는 기본값은 믿지 않는다 — 화면이 어떤 체형으로 저장되는지 말할 수 없게 된다.
    fetchMock.mockResolvedValue(jsonResponse({ characters: rows, defaultCharacterId: "gone" }));
    expect((await modelsHttp.list({})).defaultCharacterId).toBe("b");

    fetchMock.mockResolvedValue(
      jsonResponse({ characters: rows.map((row) => ({ ...row, isDefault: false })) }),
    );
    expect((await modelsHttp.list({})).defaultCharacterId).toBe("a");
  });
});
