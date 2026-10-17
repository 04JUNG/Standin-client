import { cn } from "@/shared/lib/cn";
import { formatShapeValue, shapeLabel } from "./shapeLabels";
import { groupControls } from "./shapeGroups";
import type { ShapeControl, ShapeSpec } from "./contract";

/** Tailwind가 찾을 수 있게 클래스 이름을 그대로 둔다. */
const BASIC_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function ShapeSlider({
  control,
  value,
  disabled,
  onChange,
  id,
}: {
  control: ShapeControl;
  value: number;
  disabled?: boolean;
  onChange(value: number): void;
  id: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(32px,auto)_minmax(0,1fr)_44px] items-center gap-1.5">
      <label
        htmlFor={id}
        className="whitespace-nowrap text-[11.5px] font-semibold text-text-primary"
      >
        {control.label ?? shapeLabel(control.key)}
      </label>
      <input
        id={id}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-[18px] w-full accent-brand-coral disabled:opacity-40"
      />
      <output htmlFor={id} className="text-right font-mono text-[10.5px] text-text-secondary">
        {formatShapeValue(control, value)}
      </output>
    </div>
  );
}

/**
 * 기본 조절(두 줄, 윗줄이 한 칸 더 많다: 5개 → 3·2, 6개 → 3·3, 7개 → 4·3) + 나머지 세부 조절.
 * 후보 화면의 체형 더보기와 체형 커스텀이 같은 배치를 쓴다.
 *
 * `detail`: 세부 조절을 어떻게 보일지.
 * - "collapsed"(기본): 접힌 "세부 조절 N개" — 후보 화면처럼 자리가 좁을 때.
 * - "hidden" / "expert": 체형 커스텀의 [전문가용] 끔·켬. 켜면 세부 조절이 부위별로 다 펼쳐진다.
 *   기본 조절과 세부 조절은 서로 다른 축이라(레이어) 기본 바를 움직여도 세부 값은 그대로다.
 */
export function ShapeControlGrid({
  spec,
  values,
  onChange,
  idPrefix,
  disabled,
  detailColumns,
  detail = "collapsed",
}: {
  spec: ShapeSpec;
  values: Record<string, number>;
  onChange(key: string, value: number): void;
  idPrefix: string;
  disabled?: boolean;
  /** 세부 조절 칸 수(바는 3, 앱은 4). */
  detailColumns: 3 | 4;
  detail?: "collapsed" | "hidden" | "expert";
}) {
  const basic = Math.min(spec.basic ?? 5, spec.controls.length);
  const rest = spec.controls.slice(basic);
  const slider = (control: ShapeControl) => (
    <ShapeSlider
      key={control.key}
      id={`${idPrefix}-${control.key}`}
      control={control}
      value={values[control.key] ?? control.default}
      disabled={disabled}
      onChange={(v) => onChange(control.key, v)}
    />
  );
  const columns = detailColumns === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <>
      <div
        data-basic-controls={basic}
        className={cn("grid gap-x-4 gap-y-1", BASIC_COLUMNS[Math.ceil(basic / 2)] ?? "grid-cols-4")}
      >
        {spec.controls.slice(0, basic).map(slider)}
      </div>
      {rest.length > 0 && detail === "collapsed" && (
        <details className="text-[11px] text-text-secondary">
          <summary className="cursor-pointer select-none">세부 조절 {rest.length}개</summary>
          <div className={cn("mt-1.5 grid gap-x-4 gap-y-1", columns)}>{rest.map(slider)}</div>
        </details>
      )}
      {rest.length > 0 && detail === "expert" && (
        <div data-expert-controls={rest.length} className="flex flex-col gap-2.5 pt-1">
          {groupControls(rest).map((group) => (
            <fieldset key={group.id} className="min-w-0 border-t border-border pt-1.5">
              <legend className="pr-2 text-[11px] font-bold text-text-secondary">
                {group.label}
              </legend>
              <div className={cn("grid gap-x-4 gap-y-1", columns)}>
                {group.controls.map(slider)}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </>
  );
}
