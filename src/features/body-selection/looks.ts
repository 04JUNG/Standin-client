import { useMemo } from "react";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import type { BodyLook } from "./contract";
import { useBodyPreferences } from "./preferences";

/**
 * 작업 밖(체형 커스텀 화면)에서 그릴 수 있는 체형들.
 * = 서버가 수치 조절을 허락한 체형(`shapeEditable`, 이름·그림·3D 자산 포함)
 * + 모델 목록의 사용 가능한 체형(수치 없이 그대로 — 아동형처럼 고정 체형).
 */
export function useBodyLooks() {
  const prefs = useBodyPreferences();
  const catalog = useModelCatalog();
  const looks = useMemo(() => {
    const out = new Map<string, BodyLook>();
    for (const e of prefs.data?.shapeEditable ?? []) out.set(e.characterId, { ...e });
    if (catalog.data?.origin === "server")
      for (const c of catalog.data.characters) {
        if (!c.bodyRef || c.availability !== "available") continue;
        const known = out.get(c.characterId);
        out.set(c.characterId, {
          ...known,
          characterId: c.characterId,
          displayName: known?.displayName ?? c.displayName,
          bodyRef: c.bodyRef,
        });
      }
    return [...out.values()];
  }, [prefs.data, catalog.data]);
  const find = (id?: string) => looks.find((l) => l.characterId === id);
  return {
    prefs,
    catalog,
    looks,
    find,
    name: (id?: string) => find(id)?.displayName ?? id ?? "",
  };
}
