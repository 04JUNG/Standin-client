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
  return { open, setOpen: (value: boolean) => set(key, value) };
}

/* ------------------------------------------------------------------ 표시 도우미 */

export type BodyKind = "male" | "female" | "child";
export const BODY_KIND_LABEL: Record<BodyKind, string> = {
  male: "남성",
  female: "여성",
  child: "아동",
};
/** 카탈로그에 종류 필드가 없어 id·이름으로 나눈다. 모르면 남성 쪽에 둔다. */
export function bodyKind(option: Pick<BodyOption, "characterId" | "displayName">): BodyKind {
  const text = `${option.characterId} ${option.displayName ?? ""}`.toLowerCase();
  if (/child|kid|아동|어린이/.test(text)) return "child";
  if (/female|woman|girl|여성|여자/.test(text)) return "female";
  return "male";
}
