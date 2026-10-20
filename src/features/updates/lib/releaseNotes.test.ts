import { beforeEach, describe, expect, it } from "vitest";
import {
  compareVersions,
  validateCatalog,
  releasesBetween,
  formatNotes,
} from "../../../../releases/catalog.mjs";
import { markReleaseSeen, SEEN_RELEASE_KEY } from "./releaseNotes";
import { safeStorage } from "@/shared/lib/safeStorage";

const entry = (version: string) => ({
  version,
  date: "2026-10-20",
  title: "변경 사항",
  features: [],
  improvements: ["캡처 개선"],
  fixes: [],
});
beforeEach(() => safeStorage.removeItem(SEEN_RELEASE_KEY));

describe("release notes", () => {
  it("beta.9에서 beta.10으로 비교하고 정식 버전은 beta 뒤에 둔다", () => {
    expect(compareVersions("0.1.1-beta.9", "0.1.1-beta.10")).toBe(-1);
    expect(compareVersions("0.1.1-beta.10", "0.1.1")).toBe(-1);
    expect(compareVersions("0.1.1+build.1", "0.1.1+build.2")).toBe(0);
  });
  it("건너뛴 버전은 하나의 목록에 모으고 미래 릴리스는 제외한다", () => {
    const catalog = [entry("1.0.0"), entry("1.0.1"), entry("1.0.2"), entry("1.0.3")];
    expect(releasesBetween(catalog, "1.0.0", "1.0.2").map((r) => r.version)).toEqual([
      "1.0.2",
      "1.0.1",
    ]);
    expect(releasesBetween(catalog, null, "1.0.2").map((r) => r.version)).toEqual(["1.0.2"]);
    expect(releasesBetween(catalog, "1.0.2", "1.0.2")).toEqual([]);
    expect(releasesBetween(catalog, "1.0.3", "1.0.2")).toEqual([]);
  });
  it("빈 내역, placeholder, 중복 버전, 잘못된 날짜를 거부한다", () => {
    expect(() => validateCatalog([{ ...entry("1.0.0"), improvements: [] }])).toThrow();
    expect(() => validateCatalog([{ ...entry("1.0.0"), improvements: ["TODO"] }])).toThrow();
    expect(() => validateCatalog([entry("1.0.0"), entry("1.0.0")])).toThrow();
    expect(() => validateCatalog([{ ...entry("1.0.0"), date: "2026-02-30" }])).toThrow();
    expect(() => validateCatalog([entry("1.0.0-beta.01")])).toThrow();
  });
  it("확인 기록은 재실행에 유지되고 다운그레이드로 되돌리지 않는다", () => {
    markReleaseSeen("1.0.2");
    markReleaseSeen("1.0.1");
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBe("1.0.2");
  });
  it("배포 설명과 앱에 같은 변경 항목을 사용한다", () => {
    expect(formatNotes(entry("1.0.0"))).toContain("### 개선\n- 캡처 개선");
  });
});
