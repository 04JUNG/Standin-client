import type { Accelerator } from "@/shared/types/shortcuts";

/**
 * accelerator 문자열의 파싱·정규화·매칭(docs/07 §7).
 *
 * 정본 표기는 `수정자*+code`이고 수정자 순서를 고정해 직렬화하므로,
 * "Shift+Mod+KeyS"와 "Mod+Shift+KeyS"는 같은 값으로 수렴한다.
 * 이 한 표기가 앱 내 매칭·네이티브 등록·영속화·화면 표시에 모두 쓰인다.
 *
 * 순수 함수만 둔다. DOM 타입에 의존하지 않아 jsdom 없이 테스트할 수 있다.
 */

export type Modifier = "Mod" | "Alt" | "Shift" | "Meta";

export type ParsedAccelerator = { mods: Modifier[]; code: string };

/** 이벤트 대신 최소 형태만 받아 jsdom 없이 테스트할 수 있게 한다. */
export type KeyEventLike = {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** 직렬화 순서. 이 순서가 정규 표기를 정의한다. */
const MODIFIER_ORDER: readonly Modifier[] = ["Mod", "Alt", "Shift", "Meta"];

const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);

/** 수정자 키 자체의 code. 이것만 눌린 상태는 accelerator가 아니다. */
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
]);

/** code → 표시 문자. 없으면 code에서 접두사를 벗겨 쓴다. */
const DISPLAY_KEY: Record<string, string> = {
  Escape: "Esc",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Space: "Space",
  Tab: "Tab",
  Slash: "/",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/**
 * 우리가 accelerator로 허용하는 비영숫자 code 목록.
 *
 * 이 집합은 global-hotkey 0.8의 `parse_key`가 받아들이는 code 이름과 일치한다
 * (그 함수는 입력을 대문자화해 "SLASH"·"ARROWUP"·"NUMPADENTER" 등을 그대로 받는다).
 * 따라서 네이티브로 넘길 때 별도 변환표가 필요 없다 — toTauriAccelerator 참고.
 */
const NAMED_CODES = new Set([
  "Escape",
  "Enter",
  "NumpadEnter",
  "Space",
  "Tab",
  "Slash",
  "Comma",
  "Period",
  "Semicolon",
  "Quote",
  "Backquote",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/** "KeyS" → "S", "Digit1" → "1". 그 외는 null. */
function plainKeyChar(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return null;
}

/** "F1"~"F24". */
function isFunctionKey(code: string): boolean {
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(code);
}

/**
 * accelerator 문자열을 파싱한다. 형식이 잘못되면 null.
 * 중복 수정자, 수정자만 있는 입력, 빈 code는 모두 거부한다.
 */
export function parseAccelerator(input: string): ParsedAccelerator | null {
  if (typeof input !== "string") return null;
  const parts = input
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;

  const mods: Modifier[] = [];
  let code: string | null = null;

  for (const part of parts) {
    if (MODIFIER_SET.has(part)) {
      const mod = part as Modifier;
      if (mods.includes(mod)) return null; // 중복 수정자
      mods.push(mod);
      continue;
    }
    if (code !== null) return null; // key가 두 개
    code = part;
  }

  if (code === null) return null; // 수정자만
  // code가 우리가 아는 형태인지 확인한다(손상된 영속값 거부).
  const known = plainKeyChar(code) !== null || isFunctionKey(code) || NAMED_CODES.has(code);
  if (!known) return null;

  return { mods, code };
}

/** 항상 고정 순서로 직렬화한다. 같은 조합은 항상 같은 문자열이 된다. */
export function formatAccelerator(parsed: ParsedAccelerator): Accelerator {
  const mods = MODIFIER_ORDER.filter((m) => parsed.mods.includes(m));
  return [...mods, parsed.code].join("+");
}

/** 입력 문자열을 정규 표기로 되돌린다. 파싱 실패면 null. */
export function normalizeAccelerator(input: string): Accelerator | null {
  const parsed = parseAccelerator(input);
  return parsed ? formatAccelerator(parsed) : null;
}

/**
 * 키 이벤트를 accelerator로 변환한다. 재지정 UI의 키 캡처용.
 * 수정자만 눌린 상태에서는 null을 돌려준다(라이브 프리뷰에서 아직 확정 아님).
 *
 * ctrl과 meta를 모두 Mod로 접는다 — 플랫폼별로 하나만 쓰기 때문이다.
 * 둘을 동시에 누른 경우는 Mod+Meta로 구분해 표현한다.
 */
export function acceleratorFromEvent(e: KeyEventLike): Accelerator | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const parsed = parseAccelerator(e.code);
  if (!parsed) return null;

  const mods: Modifier[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Mod");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  // ctrl과 meta를 동시에 누른 경우만 Meta를 따로 표기한다.
  if (e.ctrlKey && e.metaKey) mods.push("Meta");

  return formatAccelerator({ mods, code: parsed.code });
}

/**
 * 이벤트가 accelerator와 일치하는지. 수정자 조합이 **정확히** 같아야 한다.
 * (Ctrl+Shift+S가 Ctrl+S를 발동시키지 않게 하는 것이 핵심이다.)
 */
export function matchesAccelerator(e: KeyEventLike, accel: Accelerator, mac: boolean): boolean {
  const parsed = parseAccelerator(accel);
  if (!parsed) return false;
  if (e.code !== parsed.code) return false;

  const wantMod = parsed.mods.includes("Mod");
  const wantMeta = parsed.mods.includes("Meta");
  const wantAlt = parsed.mods.includes("Alt");
  const wantShift = parsed.mods.includes("Shift");

  if (e.altKey !== wantAlt) return false;
  if (e.shiftKey !== wantShift) return false;

  // Mod+Meta는 ctrl과 meta를 동시에 요구한다.
  if (wantMod && wantMeta) return e.ctrlKey && e.metaKey;

  // Mod는 플랫폼의 주 수정자만 요구하고, 반대쪽은 눌리지 않아야 한다.
  const primary = mac ? e.metaKey : e.ctrlKey;
  const secondary = mac ? e.ctrlKey : e.metaKey;
  if (wantMod) return primary && !secondary;
  if (wantMeta) return e.metaKey && !e.ctrlKey;
  return !e.ctrlKey && !e.metaKey;
}

/**
 * Shift 이외의 수정자를 포함하는지.
 * 입력 중 허용 판단(docs/07 §7)과 전역 단축키 검증에 쓴다.
 */
export function hasNonShiftModifier(accel: Accelerator): boolean {
  const parsed = parseAccelerator(accel);
  if (!parsed) return false;
  return parsed.mods.some((m) => m !== "Shift");
}

/** 표시용 세그먼트. mac이면 ["⌘","⇧","S"], 아니면 ["Ctrl","Shift","S"]. */
export function toDisplayKeys(accel: Accelerator, mac: boolean): string[] {
  const parsed = parseAccelerator(accel);
  if (!parsed) return [];

  const out: string[] = [];
  for (const mod of MODIFIER_ORDER) {
    if (!parsed.mods.includes(mod)) continue;
    if (mod === "Mod") out.push(mac ? "⌘" : "Ctrl");
    else if (mod === "Alt") out.push(mac ? "⌥" : "Alt");
    else if (mod === "Shift") out.push(mac ? "⇧" : "Shift");
    else out.push(mac ? "⌃" : "Meta");
  }

  const plain = plainKeyChar(parsed.code);
  out.push(plain ?? DISPLAY_KEY[parsed.code] ?? parsed.code);
  return out;
}

/**
 * 네이티브(tauri-plugin-global-shortcut) accelerator 문자열로 변환한다.
 * 파싱할 수 없는 조합은 null — 호출부가 등록을 시도하지 않고 안내한다.
 *
 * key 부분은 변환하지 않고 code를 그대로 넘긴다. global-hotkey의 `parse_key`가
 * 입력을 대문자화해 "KEYS"·"DIGIT2"·"SLASH"·"ARROWUP" 같은 code 이름을 그대로
 * 받아들이기 때문이다("S"·"2"·"/" 단축 표기도 받지만 둘 중 하나만 쓰면 된다).
 * 변환표를 두면 표에서 빠진 키를 조용히 거부하게 되므로 두지 않는다.
 *
 * 수정자만 이름이 다르다: Mod → CmdOrCtrl(Windows/Linux는 Ctrl, macOS는 Command).
 */
export function toTauriAccelerator(accel: Accelerator): string | null {
  const parsed = parseAccelerator(accel);
  if (!parsed) return null;

  const out: string[] = [];
  for (const mod of MODIFIER_ORDER) {
    if (!parsed.mods.includes(mod)) continue;
    if (mod === "Mod") out.push("CmdOrCtrl");
    else if (mod === "Meta") out.push("Super");
    else out.push(mod); // Alt · Shift는 이름이 같다
  }

  out.push(parsed.code);
  return out.join("+");
}
