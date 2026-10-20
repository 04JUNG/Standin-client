/**
 * 브라우저(Vite) 개발용 체형 Mock. pose.mock과 같은 스위치(`useMockPoseApi`)로 켜진다.
 *
 * 실서버의 체형 선택·수치 조절·미리보기를 메모리에서 흉내낸다. 미리보기 그림은 canvas로
 * 그린 단순 실루엣이라 실제 렌더가 아니다 — UX 흐름을 확인하는 용도다.
 * 테스트(MODE=test)에서는 꺼진다. 테스트는 HTTP 계약을 직접 검증한다.
 */
import { env } from "@/shared/lib/env";
import { mockOutputScope, type BodyScope } from "@/features/pose-viewer/api/outputScope";
import type { PersonResult, PoseCandidate } from "@/features/pose-viewer/api/pose.contract";
import type { CardChange } from "./api";
import type {
  BodyCard,
  BodyChange,
  BodyManifest,
  BodyLook,
  BodyOption,
  BodyPreferences,
  BodySelection,
  ShapeSpec,
} from "./contract";

export function bodyMockEnabled() {
  return env.useMockPoseApi && !env.isProduction && import.meta.env.MODE !== "test";
}

type Preset = {
  name: string;
  height: number;
  heads: number;
  physique: number;
  muscle: number;
  shoulders: number;
  muscle_bulk?: number;
};

/**
 * 쉐이프키 체형: 기준 모델의 컨트롤러 규칙·프리셋 값을 그대로 쓴다(남성 standin-body-0.7.1 9종,
 * 여성 standin-female-body-0.3.3 11종 — body-production-release-2026-10-16-v0.7.1-v0.3.3의 프리셋·이름).
 * 실서버에서는 승인 manifest가 spec과 shapeRuntime을 준다.
 */
type ShapeBody = {
  kind: "male" | "female";
  name: string;
  rules: string;
  preset: string;
  /** 컨트롤러 프리셋 값(앱 key: height, 나머지는 컨트롤러 key와 같다). */
  values: Record<string, number>;
};
const MALE_RULES = "standin-body-0.7.1";
const FEMALE_RULES = "standin-female-body-0.3.3";
const male = (name: string, preset: string, values: Record<string, number>): ShapeBody => ({
  kind: "male",
  name,
  rules: MALE_RULES,
  preset,
  values,
});
const female = (name: string, preset: string, values: Record<string, number>): ShapeBody => ({
  kind: "female",
  name,
  rules: FEMALE_RULES,
  preset,
  values,
});
const SHAPE_BODIES: Record<string, ShapeBody> = {
  "male-base": male("기본형", "BASE", {}),
  "male-ideal83": male("8.3등신", "IDEAL83", {
    heads: 8.3,
    physique: -0.25,
    muscle: 0.65,
    leg_length: 0.65,
    arm_length: 0.2,
    shoulders: 0.65,
    waist: -0.25,
    detail_calf: -0.2,
  }),
  "male-ideal70": male("7등신", "IDEAL70", {
    heads: 7,
    physique: -0.2,
    muscle: 0.45,
    leg_length: 0.18,
    torso_length: -0.08,
    arm_length: -0.12,
    shoulders: 0.15,
    waist: -0.2,
    pelvis: 0.08,
  }),
  "male-toon64": male("6.4등신", "TOON64", {
    head_scale: 0.9,
    height: 165,
    heads: 6.4,
    head_depth: -0.1,
    neck_width: 0.1,
    neck_length: -0.3,
    physique: -0.85,
    muscle: 0.1,
    shoulders: -0.7,
    chest_width: -0.35,
    chest_depth: -0.2,
    waist: -0.35,
    pelvis: -0.25,
    leg_length: -0.15,
    torso_length: -0.08,
    arm_length: -0.35,
    thigh: -0.25,
    calf: -0.2,
  }),
  "male-muscular": male("근육형", "MUSCULAR", {
    heads: 7.1,
    muscle: 1.4,
    definition: 0.65,
    shoulders: 0.65,
    chest_width: 0.15,
    detail_chest: 0,
    thigh: 0.25,
  }),
  "male-muscle-max": male("고근육형", "MUSCLE_MAX", {
    heads: 7,
    muscle: 2,
    definition: 0.65,
    shoulders: 0.75,
    chest_width: 0.2,
    detail_chest: 0,
  }),
  "male-bulk": male("벌크형", "BULK", {
    heads: 7,
    muscle: 2,
    muscle_bulk: 1,
    definition: 0.65,
    shoulders: 0.75,
    chest_width: 0.2,
    detail_chest: 0,
  }),
  "male-soft": male("부드러운형", "SOFT", {
    head_scale: 0.927,
    heads: 6.95,
    neck_width: 0.2,
    neck_length: -0.1,
    physique: 1,
    waist: 0.1,
    glute: 0,
    pelvis: 0.1,
  }),
  "male-fat-max": male("통통형", "FAT_MAX", {
    head_scale: 0.927,
    heads: 6.7,
    neck_width: 0.4,
    neck_length: -0.2,
    physique: 1.7,
    waist: 0.1,
    pelvis: 0.2,
    glute: 0,
  }),
  "female-base": female("기본형", "BASE", {}),
  "female-slim": female("슬림형", "SLIM", { physique: -0.8, muscle: 0.12 }),
  "female-ideal83": female("8.3등신", "IDEAL83", {
    heads: 8.3,
    physique: -0.2,
    muscle: 0.35,
    leg_length: 0.35,
    shoulders: 0.12,
    waist: -0.12,
  }),
  "female-ideal70": female("7등신", "IDEAL70", {
    height: 168,
    heads: 7,
    muscle: 0.2,
    leg_length: 0.1,
  }),
  "female-toon64": female("6.4등신", "TOON64", {
    height: 162,
    heads: 6.4,
    head_scale: 0.96,
    physique: -0.2,
    shoulders: -0.1,
    breast_size: -0.2,
  }),
  "female-athletic": female("탄탄형", "MUSCULAR", {
    muscle: 1.25,
    definition: 0.45,
    shoulders: 0.25,
    thigh: 0.12,
  }),
  "female-muscular": female("근육형", "MUSCLE_MAX", {
    muscle: 2,
    definition: 0.7,
    shoulders: 0.4,
    thigh: 0.2,
  }),
  "female-muscle-max": female("고근육형", "NEW_MUSCULAR", {
    muscle: 4,
    definition: 0.7,
    shoulders: 0.4,
    thigh: 0.2,
  }),
  "female-soft": female("부드러운형", "SOFT", {
    physique: 0.8,
    fat_distribution: 0.15,
    head_scale: 1.03,
  }),
  "female-fat": female("통통형", "FAT_MAX", {
    physique: 1.4,
    fat_distribution: 0.2,
    head_scale: 1.03,
  }),
  "female-full": female("풍만형", "NEW_FAT", { physique: 1.4, fat_distribution: 0.2, fat_gain: 2 }),
};
const FIXED: Record<string, Preset & { kind: "child" }> = {
  child: {
    name: "아동",
    kind: "child",
    height: 125,
    heads: 5.6,
    physique: -0.3,
    muscle: 0,
    shoulders: -0.6,
  },
};

/**
 * 조절 바: [key, min, max, step, default, label?]. 앞의 `basic`개가 기본 조절이고 나머지는 세부 조절.
 * 남성 6개(위 3·아래 3, 근육 볼륨 포함), 여성 7개(위 4·아래 3). 머리 크기는 0.001 단위(프리셋 0.927·1.03이 눈금에 오도록).
 */
type Field = [string, number, number, number, number, string?];
const MALE_FIELDS: Field[] = [
  ["height", 160, 195, 1, 178],
  ["heads", 5.5, 8.7, 0.1, 7.2],
  ["physique", -1, 1.7, 0.05, 0],
  ["muscle", 0, 2, 0.05, 0],
  ["muscle_bulk", 0, 1, 0.05, 0, "근육 볼륨"],
  ["shoulders", -1, 1, 0.05, 0],
  ["definition", 0, 1, 0.05, 0],
  ["head_scale", 0.9, 1, 0.001, 1],
  ["neck_width", -1, 1, 0.05, 0],
  ["neck_length", -1, 1, 0.05, 0],
  ["chest_width", -1, 1, 0.05, 0],
  ["chest_depth", -1, 1, 0.05, 0],
  ["waist", -1, 1, 0.05, 0],
  ["pelvis", -1, 1, 0.05, 0],
  ["glute", -1, 1, 0.05, 0],
  ["thigh", -1, 1, 0.05, 0],
  ["calf", -1, 1, 0.05, 0],
  ["torso_length", -1, 1, 0.05, 0],
  ["arm_length", -1, 1, 0.05, 0],
  ["leg_length", -1, 1, 0.05, 0],
  ["leg_ratio", -1, 1, 0.05, 0],
];
const FEMALE_FIELDS: Field[] = [
  ["height", 150, 190, 1, 175, "키"],
  ["heads", 6.2, 8.7, 0.1, 7.4, "등신"],
  ["shoulders", -1, 1, 0.05, 0, "어깨너비"],
  ["muscle", 0, 4, 0.05, 0, "근육량"],
  ["physique", -1, 1.4, 0.05, 0, "지방"],
  ["fat_gain", 0, 2, 0.05, 0, "지방 볼륨"],
  ["breast_size", -1, 1, 0.05, 0, "가슴 크기"],
  ["definition", 0, 1, 0.05, 0, "근육 선명도"],
  ["fat_distribution", -1, 1, 0.05, 0, "지방 분포 · 복부↔둔부"],
  ["breast_projection", -1, 1, 0.05, 0, "가슴 돌출"],
  ["breast_spacing", -1, 1, 0.05, 0, "가슴 간격"],
  ["breast_height", -1, 1, 0.05, 0, "가슴 높이"],
  ["breast_width", -1, 1, 0.05, 0, "가슴 폭"],
  ["head_scale", 0.94, 1.04, 0.001, 1, "머리 크기"],
  ["neck_width", -1, 1, 0.05, 0, "목 두께"],
  ["neck_length", -1, 1, 0.05, 0, "목 길이"],
  ["chest_width", -1, 1, 0.05, 0, "흉곽 너비"],
  ["waist", -1, 1, 0.05, 0, "허리 너비"],
  ["pelvis", -1, 1, 0.05, 0, "골반 너비"],
  ["glute", -1, 1, 0.05, 0, "엉덩이 돌출"],
  ["thigh", -1, 1, 0.05, 0, "허벅지 두께"],
  ["calf", -1, 1, 0.05, 0, "종아리 두께"],
  ["torso_length", -1, 1, 0.05, 0, "몸통 길이"],
  ["arm_length", -1, 1, 0.05, 0, "팔 길이"],
  ["leg_length", -1, 1, 0.05, 0, "다리 길이"],
  ["leg_ratio", -1, 1, 0.05, 0, "허벅지 : 종아리"],
];

function spec(id: string): ShapeSpec {
  const body = SHAPE_BODIES[id]!;
  const fields = body.kind === "female" ? FEMALE_FIELDS : MALE_FIELDS;
  return {
    schemaVersion: "body-shape.v1",
    basic: body.kind === "female" ? 7 : 6,
    controls: fields.map(([key, min, max, step, d, label]) => ({
      key,
      min,
      max,
      step,
      default: body.values[key] ?? d,
      ...(label ? { label } : {}),
    })),
  };
}

/** 실시간 미리보기 자산의 자리. Mock은 bodyMock.shapeRuntime(rules)가 바이트를 준다. */
const shapeRuntimeRef = (id: string) => ({
  url: "/v1/mock/shape-runtime",
  // 앱은 sha256으로 자산을 캐시한다. 규칙마다 다른 값이어야 남녀 자산이 섞이지 않는다.
  sha256: hex(SHAPE_BODIES[id]!.rules),
  bytes: 1,
  format: "standin-shape-runtime.v1" as const,
  rules: SHAPE_BODIES[id]!.rules,
  preset: SHAPE_BODIES[id]!.preset,
});
declare global {
  // eslint-disable-next-line no-var
  var __STANDIN_MOCK_SHAPE_RUNTIMES__: Record<string, string> | undefined;
}
const RUNTIME_FILES: Record<string, string> = {
  [MALE_RULES]: "/mock/shape-runtime-0.7.1.ssr",
  [FEMALE_RULES]: "/mock/shape-runtime-female-0.3.3.ssr",
};
async function mockRuntimeBytes(rules: string): Promise<ArrayBuffer> {
  // 단일 HTML 목업: 빌드가 규칙별 gzip+base64로 넣어 둔다. Vite 개발 서버: public/mock/의 파일.
  const inline = globalThis.__STANDIN_MOCK_SHAPE_RUNTIMES__?.[rules];
  if (inline) {
    const gz = Uint8Array.from(atob(inline), (c) => c.charCodeAt(0));
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
  }
  const file = RUNTIME_FILES[rules];
  if (!file) throw new Error("mock shape runtime missing");
  const res = await fetch(file);
  if (!res.ok) throw new Error("mock shape runtime missing");
  return res.arrayBuffer();
}
const hex = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8);
};
const ref = (id: string) => ({
  bodyId: "mock-" + id,
  bodyVersion: "mock",
  assetSha256: hex(id),
  rigVersion: "mock",
  measurementVersion: "mock",
  characterId: id,
});
/** 실루엣(대체 그림)용 대략 값. */
const preset = (id: string): Preset => {
  const body = SHAPE_BODIES[id];
  if (!body) return FIXED[id] ?? FIXED.child!;
  const v = body.values;
  const base = body.kind === "female" ? 175 : 178;
  return {
    name: body.name,
    height: v.height ?? base,
    heads: v.heads ?? (body.kind === "female" ? 7.4 : 7.2),
    physique: v.physique ?? 0,
    muscle: Math.min(2, v.muscle ?? 0),
    shoulders: v.shoulders ?? (body.kind === "female" ? -0.5 : 0),
    muscle_bulk: v.muscle_bulk ?? 0,
  };
};

/* ---------------------------------------------------------------- 그림 */

/** 단순 실루엣. 체형 값이 화면에서 구분될 만큼만 반영한다. */
function drawBody(
  label: string,
  p: Preset & { controls?: Record<string, number> },
  pose: number | null,
  female: boolean,
  scope: BodyScope = "full",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const v = { ...p, ...(p.controls ?? {}) } as Preset & Record<string, number>;
  ctx.fillStyle = "#e8ecf1";
  ctx.fillRect(0, 0, 240, 280);
  const total = 210 * Math.min(1, (v.height ?? 178) / 185);
  const head = total / Math.max(5, v.heads ?? 7);
  const top = 255 - total;
  const cx = 120;
  const bulk = 1 + (v.physique ?? 0) * 0.35 + (v.muscle ?? 0) * 0.12 + (v.muscle_bulk ?? 0) * 0.18;
  const shoulder = (female ? 30 : 36) * (1 + (v.shoulders ?? 0) * 0.25) * Math.sqrt(bulk);
  const hip = (female ? 30 : 26) * bulk;
  const waist = 1 + (v.waist ?? 0) * 0.18;
  // 목·다리 길이는 몸통 높이를 조금 옮겨 보이게만 한다(실제 비율 계산 아님).
  const neckShift = head * 0.25 * (v.neck_length ?? 0);
  const legShift = -head * 0.35 * (v.leg_length ?? 0);
  ctx.fillStyle = "#9aa3ae";
  ctx.strokeStyle = "#9aa3ae";
  ctx.lineCap = "round";
  // 머리
  ctx.beginPath();
  ctx.ellipse(cx, top + head / 2, head * 0.36, head / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  const neck = top + head + neckShift;
  const waistY = neck + head * 2.6 + legShift * 0.6;
  const hipY = neck + head * 3.2 + legShift;
  // 몸통
  ctx.beginPath();
  ctx.moveTo(cx - shoulder, neck + head * 0.35);
  ctx.lineTo(cx + shoulder, neck + head * 0.35);
  ctx.lineTo(cx + hip * 0.82 * waist, waistY);
  ctx.lineTo(cx + hip, hipY);
  ctx.lineTo(cx - hip, hipY);
  ctx.lineTo(cx - hip * 0.82 * waist, waistY);
  ctx.closePath();
  ctx.fill();
  // 팔 · 다리 (자세별 각도)
  const limb = 9 * Math.sqrt(bulk) * (1 + (v.muscle ?? 0) * 0.15);
  ctx.lineWidth = limb;
  const arm = head * 3;
  const angles = [
    [1.45, 1.69],
    [-1.35, -1.79],
    [0.1, 3.04],
    [0.0, 3.14],
    [0.6, 2.54],
  ][pose ?? 2];
  for (const [side, a] of [
    [-1, angles[1]],
    [1, angles[0]],
  ] as const) {
    const sx = cx + side * shoulder;
    const sy = neck + head * 0.45;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * arm, sy + Math.sin(a) * arm);
    ctx.stroke();
  }
  ctx.lineWidth = limb * 1.25;
  const kneeUp = pose === 2 || pose === 4;
  for (const side of [-1, 1]) {
    const hx = cx + side * hip * 0.55;
    ctx.beginPath();
    ctx.moveTo(hx, hipY);
    if (kneeUp && side === 1) {
      ctx.lineTo(hx + 18, hipY + head * 1.4);
      ctx.lineTo(hx + 6, hipY + head * 2.6);
    } else ctx.lineTo(hx + side * 6, 255);
    ctx.stroke();
  }
  ctx.fillStyle = "#4a5566";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, 272);
  ctx.font = "10px sans-serif";
  ctx.fillText("MOCK", 214, 14);
  if (scope === "full") return canvas.toDataURL("image/png");
  // Development silhouette only; production framing uses the verified converter surface.
  const cropped = document.createElement("canvas");
  cropped.width = 240;
  cropped.height = 280;
  const output = cropped.getContext("2d");
  if (!output) return "";
  const bottom = scope === "half" ? hipY : scope === "bust" ? neck + head : top + head;
  output.fillStyle = "#e8ecf1";
  output.fillRect(0, 0, 240, 280);
  output.drawImage(canvas, 0, top, 240, bottom - top + 5, 0, 0, 240, 255);
  output.fillStyle = "#4a5566";
  output.font = "bold 13px sans-serif";
  output.textAlign = "center";
  output.fillText(label + " · MOCK", 120, 272);
  return cropped.toDataURL("image/png");
}

/* ---------------------------------------------------------------- 상태 */

const people = new Map<string, PersonResult>();
const selections = new Map<string, BodySelection>();
let preferences: BodyPreferences = {
  version: "body-preferences.v1",
  scope: "installation",
  mode: "last_used",
  defaultCharacterId: null,
  shapeDefault: null,
  // 처음에는 비어 있다 — 체형 커스텀에서 카드를 만드는 흐름을 처음부터 볼 수 있게.
  cards: [],
  lastUsed: null,
  revision: 1,
};
let cardSeq = 0;
const key = (job: string, person: number) => job + ":" + person;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const autoFor = (index: number) => (index === 1 ? "female-base" : "male-base");

/**
 * pose.mock이 분석 결과를 만들 때 부른다. 체형 상태는 인물마다 마지막으로 고른 체형
 * (`last_used`, 실서버와 같은 규칙)에서, 아직 고른 적이 없으면 남성 기본형에서 시작한다.
 */
export function registerMockPeople(job: string, list: PersonResult[]) {
  const last = preferences.mode === "last_used" ? preferences.lastUsed : null;
  for (const p of list) {
    people.set(key(job, p.index), p);
    if (selections.has(key(job, p.index))) continue;
    const body = ref(autoFor(p.index));
    const lastBody = last ? ref(last.characterId) : null;
    const firstBody = preferences.mode === "last_used" && !last ? ref("male-base") : null;
    selections.set(key(job, p.index), {
      schemaVersion: "body-selection.v1",
      personIndex: p.index,
      intent: "inherit",
      manualCharacterId: null,
      shape: last?.controls ? mockShape(last.characterId, last.controls) : null,
      recommendation: { status: "available", body, reasonCodes: [] },
      resolvedBody: lastBody ?? firstBody ?? body,
      resolvedSource: lastBody
        ? "last_used"
        : firstBody
          ? "catalog_default_fallback"
          : "auto_recommendation",
      resolutionStatus: p.candidates.length ? "ready" : "not_applicable",
      selectionRevision: 0,
    });
  }
}

/** 처음 값과 다른 수치만 shape로 둔다(실서버: 모두 처음 값이면 shape 없음). */
function mockShape(id: string, controls: Record<string, number>) {
  const defaults = SHAPE_BODIES[id] ? spec(id).controls : [];
  const changed = defaults.some((c) => Math.abs((controls[c.key] ?? c.default) - c.default) > 1e-6);
  return changed
    ? {
        schemaVersion: "body-shape.v1" as const,
        controls: { ...controls },
        shapeSha256: hex(JSON.stringify(controls)),
      }
    : null;
}

const shapeEditable = () =>
  Object.keys(SHAPE_BODIES).map((id) => ({
    characterId: id,
    shape: spec(id),
    displayName: SHAPE_BODIES[id]!.name,
    shapeRuntime: shapeRuntimeRef(id),
  }));

export const bodyMock = {
  async getSelection(job: string, person: number): Promise<BodySelection> {
    await delay(80);
    const s = selections.get(key(job, person));
    if (!s) throw new Error("mock body selection missing");
    return structuredClone(s);
  },
  async putSelection(job: string, person: number, change: BodyChange): Promise<BodySelection> {
    await delay(250);
    const s = selections.get(key(job, person));
    if (!s) throw new Error("mock body selection missing");
    const id = change.intent === "manual" ? change.characterId : autoFor(person);
    const controls = change.intent === "manual" ? change.shape?.controls : undefined;
    const next: BodySelection = {
      ...s,
      intent: change.intent,
      manualCharacterId: change.intent === "manual" ? id : null,
      resolvedBody: ref(id),
      resolvedSource: change.intent === "manual" ? "manual" : "auto_recommendation",
      shape: controls ? mockShape(id, controls) : null,
      selectionRevision: s.selectionRevision + 1,
    };
    selections.set(key(job, person), next);
    // 실서버처럼 직접 고른 체형을 다음 작업의 시작 체형으로 기억한다(설정 revision은 그대로).
    if (change.intent === "manual")
      preferences = {
        ...preferences,
        lastUsed: {
          characterId: id,
          controls: next.shape?.controls ?? null,
          usedAt: new Date().toISOString(),
        },
      };
    return structuredClone(next);
  },
  async getOptions(): Promise<{ catalogRevision: string; characters: BodyOption[] }> {
    await delay(120);
    return {
      catalogRevision: "mock",
      characters: [...Object.keys(SHAPE_BODIES), ...Object.keys(FIXED)].map((id) => ({
        characterId: id,
        bodyRef: ref(id),
        selectable: true,
        reasonCodes: [],
        displayName: preset(id).name,
        // 실서버의 차렷 미리보기 대신 loadNeutralPreview가 canvas로 그린다.
        ...(SHAPE_BODIES[id] ? { shape: spec(id), shapeRuntime: shapeRuntimeRef(id) } : {}),
      })),
    };
  },
  async getPreferences(): Promise<BodyPreferences> {
    await delay(60);
    return { ...structuredClone(preferences), shapeEditable: shapeEditable() };
  },
  async putPreferences(value: Partial<BodyPreferences>): Promise<BodyPreferences> {
    await delay(200);
    preferences = {
      ...preferences,
      mode: value.mode ?? preferences.mode,
      defaultCharacterId:
        value.defaultCharacterId !== undefined
          ? value.defaultCharacterId
          : preferences.defaultCharacterId,
      ...("shapeDefault" in value ? { shapeDefault: value.shapeDefault ?? null } : {}),
      revision: preferences.revision + 1,
    };
    return { ...structuredClone(preferences), shapeEditable: shapeEditable() };
  },
  async changeCard(change: CardChange): Promise<BodyPreferences> {
    await delay(200);
    const cards = preferences.cards ?? [];
    const at = new Date().toISOString();
    let next: BodyCard[];
    if (change.op === "create")
      next = [
        ...cards,
        {
          cardId: `card_mock_${++cardSeq}`,
          name: change.name.trim(),
          characterId: change.characterId,
          controls: { ...change.controls },
          createdAt: at,
          updatedAt: at,
        },
      ];
    else if (change.op === "update")
      next = cards.map((c) =>
        c.cardId === change.cardId
          ? {
              ...c,
              ...(change.name !== undefined ? { name: change.name.trim() } : {}),
              ...(change.characterId ? { characterId: change.characterId } : {}),
              ...(change.controls ? { controls: { ...change.controls } } : {}),
              updatedAt: at,
            }
          : c,
      );
    else next = cards.filter((c) => c.cardId !== change.cardId);
    preferences = { ...preferences, cards: next, revision: preferences.revision + 1 };
    return { ...structuredClone(preferences), shapeEditable: shapeEditable() };
  },
  async getManifest(job: string, person: number, selection: BodySelection): Promise<BodyManifest> {
    await delay(500);
    const p = people.get(key(job, person));
    if (!p || !selection.resolvedBody) throw new Error("mock body manifest missing");
    const sha = hex("mock");
    const scope = mockOutputScope(job, person, p.outputScope?.detected ?? "full").resolved;
    return {
      schemaVersion: "body-previews.v1",
      jobId: job,
      personIndex: person,
      selectionRevision: selection.selectionRevision,
      resolvedBody: selection.resolvedBody,
      renderKey: hex(job + person + selection.selectionRevision + scope),
      outputScope: scope,
      status: "renderable",
      runtime: { previewRevision: sha, modelRevision: sha },
      candidates: p.candidates.map((c: PoseCandidate) => ({
        candidateId: c.id,
        poseId: c.poseId,
        rank: c.rank,
        sourceBvhSha256: sha,
        thumbnailUrl: "/v1/mock",
        previewModel: {
          url: "/v1/mock",
          rotation: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          sourceSha: sha,
          characterId: selection.resolvedBody!.characterId,
          characterSha256: selection.resolvedBody!.assetSha256,
          modelRevision: sha,
          previewRevision: sha,
        },
      })),
    };
  },
  /** 고른 체형(조절값 포함)과 후보 순서로 그린 실루엣. */
  async renderCandidate(manifest: BodyManifest, candidateId: string): Promise<string> {
    const s = selections.get(key(manifest.jobId, manifest.personIndex));
    const id = manifest.resolvedBody.characterId;
    const rank = manifest.candidates.findIndex((c) => c.candidateId === candidateId);
    return drawBody(
      `후보 ${rank + 1} · ${preset(id).name}${s?.shape ? " 수정" : ""}`,
      { ...preset(id), controls: s?.shape?.controls },
      rank,
      id.includes("female"),
      manifest.outputScope,
    );
  },
  /** 실시간 체형 미리보기 자산(standin-shape-runtime.v1) 바이트. */
  shapeRuntime: mockRuntimeBytes,
  /**
   * "내 체형" 박스의 실시간 그림. 조절 바를 움직일 때마다 동기로 다시 그린다.
   * 실시간 3D 자산을 못 받을 때(Vite 개발 서버에 파일이 없을 때)만 쓰는 대체 실루엣.
   */
  livePreview(characterId: string, controls: Record<string, number> | null): string {
    return drawBody(
      preset(characterId).name + (controls ? " 수정" : ""),
      { ...preset(characterId), controls: controls ?? undefined },
      null,
      characterId.includes("female"),
    );
  },
  async neutralPreview(option: BodyLook): Promise<string> {
    return drawBody(
      preset(option.characterId).name,
      preset(option.characterId),
      null,
      option.characterId.includes("female"),
    );
  },
};
