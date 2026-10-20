import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  compareVersions,
  validateCatalog,
  releasesBetween,
  formatNotes,
} from "../../../../releases/catalog.mjs";
import { markReleaseSeen, readSeenRelease, SEEN_RELEASE_KEY } from "./releaseNotes";
import { safeStorage } from "@/shared/lib/safeStorage";

const entry = (version: string) => ({
  version,
  date: "2026-10-20",
  title: "변경 사항",
  features: [],
  improvements: ["캡처 개선"],
  fixes: [],
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
beforeEach(() => {
  safeStorage.removeItem(SEEN_RELEASE_KEY);
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(invoke).mockReset();
});

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
  it("확인 기록은 재실행에 유지되고 다운그레이드로 되돌리지 않는다", async () => {
    await markReleaseSeen("1.0.2");
    await markReleaseSeen("1.0.1");
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBe("1.0.2");
  });
  it("배포 설명과 앱에 같은 변경 항목을 사용한다", () => {
    expect(formatNotes(entry("1.0.0"))).toContain("### 개선\n- 캡처 개선");
  });
  it("네이티브 저장 완료를 기다리고 WebView 기록을 잃어도 확인 버전을 읽는다", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let finish!: (version: string) => void;
    vi.mocked(invoke).mockReturnValueOnce(new Promise<string>((resolve) => (finish = resolve)));
    const saving = markReleaseSeen("1.0.2");
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBeNull();
    expect(invoke).toHaveBeenCalledWith("release_notes_acknowledge");
    finish("1.0.2");
    await expect(saving).resolves.toBe("1.0.2");
    safeStorage.removeItem(SEEN_RELEASE_KEY);
    vi.mocked(invoke).mockResolvedValueOnce("1.0.2");
    await expect(readSeenRelease()).resolves.toBe("1.0.2");
  });
  it("네이티브 저장 실패를 확인 완료로 기록하지 않는다", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("disk full"));
    await expect(markReleaseSeen("1.0.2")).rejects.toThrow("disk full");
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBeNull();
  });
});
