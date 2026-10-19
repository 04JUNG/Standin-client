import { useId, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { PersonBox, PersonResult } from "../api/pose.contract";
import { cropRect, useImageSize, type ImageSize } from "../lib/roughCrop";

/**
 * 원본 러프에서 이 인물이 있는 자리. 후보 포즈와 나란히 놓고 비교하는 용도다.
 *
 * 좌표는 서버가 준 원본 픽셀 상자를 그대로 쓴다. 크기를 따로 재지 않으려고 SVG
 * viewBox로 자른다 — 컨테이너 크기가 바뀌어도 비율을 지키며 맞춰진다.
 */

/** 만료·조회 실패는 다른 작업 이미지로 대체하지 않는다. 실패 상태도 URL에 묶는다. */
function OriginalImage({ url, className }: { url: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return failedUrl === url ? (
    <p role="status" className="p-3 text-center text-[12px] text-text-secondary">
      원본 이미지를 불러올 수 없습니다.
    </p>
  ) : (
    <img
      src={url}
      alt="분석에 사용한 원본"
      className={className}
      onError={() => setFailedUrl(url)}
    />
  );
}

function Cropped({
  url,
  size,
  box,
  label,
}: {
  url: string;
  size: ImageSize;
  box: PersonBox | null | undefined;
  label: string;
}) {
  const rect = cropRect(box, size) ?? { x: 0, y: 0, ...size };
  // viewBox는 비율이 다른 칸에서 옆을 더 보여 준다. 옆 인물이 섞이지 않게 상자 밖은 자른다.
  const clip = "rough-clip-" + useId().replace(/:/g, "");
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
    >
      <defs>
        <clipPath id={clip}>
          <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
        </clipPath>
      </defs>
      <image
        href={url}
        x={0}
        y={0}
        width={size.width}
        height={size.height}
        clipPath={`url(#${clip})`}
      />
    </svg>
  );
}

/** 작은 썸네일(앱의 접힌 인물 줄). */
export function RoughThumb({
  url,
  box,
  personIndex,
  className,
}: {
  url?: string;
  box?: PersonBox | null;
  personIndex: number;
  className?: string;
}) {
  const size = useImageSize(url);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white",
        className,
      )}
    >
      {url && size ? (
        <Cropped url={url} size={size} box={box} label={`원본의 인물 ${personIndex + 1}`} />
      ) : (
        <ImageOff className="h-4 w-4 text-text-secondary" aria-hidden />
      )}
    </div>
  );
}

/** 원본 전체 위에 인물 상자를 그린다. 상자를 누르면 그 인물로 넘어간다. */
export function RoughOverview({
  url,
  people,
  current,
  excluded,
  onPick,
  className,
}: {
  url: string;
  people: PersonResult[];
  current?: number;
  excluded: Readonly<Record<number, unknown>>;
  onPick?: (personIndex: number) => void;
  className?: string;
}) {
  const size = useImageSize(url);
  if (!size) return <OriginalImage url={url} className={cn("object-contain", className)} />;
  const stroke = Math.max(2, Math.min(size.width, size.height) / 220);
  const font = Math.max(12, Math.min(size.width, size.height) / 28);
  return (
    <svg
      role="group"
      aria-label="원본과 인물 위치"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <image href={url} x={0} y={0} width={size.width} height={size.height} />
      {people.map((person) => {
        const rect = cropRect(person.box, size);
        if (!rect) return null;
        const on = person.index === current;
        const off = person.index in excluded || person.fallbackMode === "hard";
        const color = on ? "var(--brand-coral)" : off ? "#9aa5b4" : "var(--brand-sky)";
        const label = `인물 ${person.index + 1}${off ? " · 내보내기 제외" : ""}`;
        return (
          <g
            key={person.index}
            role={onPick ? "button" : undefined}
            tabIndex={onPick ? 0 : undefined}
            aria-label={label}
            aria-pressed={onPick ? on : undefined}
            onClick={onPick ? () => onPick(person.index) : undefined}
            onKeyDown={
              onPick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPick(person.index);
                    }
                  }
                : undefined
            }
            className={cn(onPick && "cursor-pointer focus:outline-none")}
          >
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              style={{
                fill: on
                  ? "rgba(255,107,87,0.08)"
                  : off
                    ? "rgba(0,0,0,0.12)"
                    : "rgba(142,216,232,0.08)",
                stroke: color,
              }}
              strokeWidth={on ? stroke * 1.5 : stroke}
              strokeDasharray={off ? `${stroke * 3} ${stroke * 2}` : undefined}
            />
            <rect
              x={rect.x}
              y={rect.y}
              width={font * 1.6}
              height={font * 1.3}
              style={{ fill: color }}
            />
            <text
              x={rect.x + font * 0.8}
              y={rect.y + font * 0.98}
              textAnchor="middle"
              fontSize={font}
              fontWeight={700}
              style={{ fill: on || off ? "#fff" : "var(--brand-ink)" }}
            >
              {person.index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 후보 옆의 원본 패널. "이 인물"은 상자대로 자른 러프, "전체"는 원본과 인물 상자.
 * 상자가 없으면 "이 인물"을 고를 수 없고 전체만 보인다.
 */
export function RoughPanel({
  url,
  people,
  person,
  excluded,
  onPick,
  showCaption = true,
  className,
}: {
  url?: string;
  people: PersonResult[];
  person: PersonResult;
  excluded: Readonly<Record<number, unknown>>;
  onPick?: (personIndex: number) => void;
  showCaption?: boolean;
  className?: string;
}) {
  const [mode, setMode] = useState<"person" | "all">("person");
  const size = useImageSize(url);
  const canCrop = !!cropRect(person.box, size);
  const view = canCrop ? mode : "all";
  return (
    <section
      aria-label={`인물 ${person.index + 1}의 원본`}
      className={cn(
        "flex min-h-0 flex-col gap-1.5 rounded-xl border border-border bg-surface-0 p-1.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-[11px] font-semibold text-text-primary">원본</span>
        <div
          role="group"
          aria-label="원본 보기"
          className="inline-flex rounded-full border border-border bg-surface-0 p-0.5"
        >
          {(
            [
              ["person", "이 인물"],
              ["all", "전체"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              disabled={value === "person" && !canCrop}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                "disabled:cursor-not-allowed disabled:opacity-40",
                view === value
                  ? "bg-brand-ink text-white"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* 그림이 칸 높이를 정하지 않게 절대 배치한다 — 높이는 옆의 후보 칸이 정한다. */}
      <div className="relative min-h-[120px] flex-1 overflow-hidden rounded-lg border border-surface-2 bg-white">
        <div className="absolute inset-0 flex items-center justify-center">
          {!url ? (
            <span className="flex flex-col items-center gap-1 p-3 text-center text-[11px] text-text-secondary">
              <ImageOff className="h-5 w-5" aria-hidden />
              원본 미리보기가 없습니다
            </span>
          ) : !size ? (
            <OriginalImage url={url} className="max-h-full max-w-full object-contain" />
          ) : view === "person" ? (
            <Cropped
              url={url}
              size={size}
              box={person.box}
              label={`원본에서 잘라 낸 인물 ${person.index + 1}`}
            />
          ) : (
            <RoughOverview
              url={url}
              people={people}
              current={person.index}
              excluded={excluded}
              onPick={onPick}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
      {showCaption && (
        <p className="px-0.5 text-[10.5px] leading-snug text-text-secondary">
          {view === "person"
            ? "후보 포즈와 나란히 비교하세요"
            : canCrop || people.some((p) => p.box)
              ? "상자를 누르면 그 인물로 넘어가요"
              : "이 결과에는 인물 위치 정보가 없습니다"}
        </p>
      )}
    </section>
  );
}
