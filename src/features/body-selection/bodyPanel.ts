import { create } from "zustand";
import { useBodyOwner } from "./hooks";
import type { BodyOption } from "./contract";

/* ------------------------------------------------------------------ 열림 상태 */

const usePanels = create<{
  open: Record<string, boolean>;
  set: (key: string, value: boolean) => void;
}>((set) => ({
  open: {},
  set: (key, value) => set((s) => ({ open: { ...s.open, [key]: value } })),
}));

/**
 * 인물별 "체형 더보기" 열림 상태. 앱↔바를 오가도 유지되도록 모듈 스토어에 둔다.
 * 열리면 그 인물의 Top-5 자리가 체형 비교 줄과 조절 바로 바뀐다.
 */
export function useBodyPanel(job: string, personIndex: number) {
  const owner = useBodyOwner();
  const key = JSON.stringify([owner, job, personIndex]);
  const open = usePanels((s) => s.open[key] === true);
  const set = usePanels((s) => s.set);
  return {
    open,
    setOpen: (value: boolean) => set(key, value),
    /** 인물을 전환할 때 현재 보기 모드를 다음 인물에도 이어 준다. */
    setOpenForPerson: (index: number, value: boolean) =>
      set(JSON.stringify([owner, job, index]), value),
  };
}

/* ------------------------------------------------------------------ 표시 도우미 */

export type BodyKind = "male" | "female" | "child";
export const BODY_KIND_LABEL: Record<BodyKind, string> = {
  male: "남성",
  female: "여성",
  child: "아동",
};
/** 명시 성별을 우선하고, 구 카탈로그만 id·이름으로 나눈다. */
export function bodyKind(
  option: Pick<BodyOption, "characterId" | "displayName" | "gender">,
): BodyKind {
  if (option.gender) return option.gender;
  const text = `${option.characterId} ${option.displayName ?? ""}`.toLowerCase();
  if (/child|kid|아동|어린이/.test(text)) return "child";
  if (/female|woman|girl|여성|여자/.test(text)) return "female";
  return "male";
}

/** Roles make defaults deterministic even if the original BASE is listed first. */
export function sortBodyLooks<T extends Pick<BodyOption, "role" | "order" | "characterId">>(
  looks: T[],
): T[] {
  return [...looks].sort(
    (a, b) =>
      (a.role === "default" ? 0 : 1) - (b.role === "default" ? 0 : 1) ||
      (a.order ?? 100) - (b.order ?? 100),
  );
}
export function initialBodyLook<
  T extends Pick<BodyOption, "characterId" | "displayName" | "gender" | "role">,
>(looks: T[], kind?: string | null): T | undefined {
  const matching = kind ? looks.filter((look) => bodyKind(look) === kind) : looks;
  return matching.find((look) => look.role === "default") ?? matching[0];
}
export function bodyRoleLabel(look: Pick<BodyOption, "role">): string | undefined {
  return look.role === "default"
    ? "기본"
    : look.role === "previous_default"
      ? "기존 기본형"
      : undefined;
}
