import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { RoughThumb } from "@/features/pose-viewer/components/RoughPanel";
import type { PersonBox } from "@/features/pose-viewer/api/pose.contract";
import { useBodyOwner } from "./hooks";
import { loadNeutralPreview } from "./api";
import { bodyMock, bodyMockEnabled } from "./mock";
import type { BodyLook } from "./contract";
import type { AnyShapeRuntime } from "./shapeRuntime/format";
import { resolveControls } from "./shapeRuntime/evaluate";
import { mountShapeBody, type ShapeBodyView } from "./shapeRuntime/mountShapeBody";
import { supportedRuntime, useShapeRuntime } from "./shapeRuntime/load";

/** 프리셋 카드의 고정 그림(서버의 차렷/T 포즈 PNG). 조절 값과 무관하게 한 번만 받는다. */
export function NeutralImage({ option }: { option: BodyLook }) {
  const owner = useBodyOwner();
  const query = useQuery({
    queryKey: ["body", owner, "neutral", option.characterId, option.neutralPreview],
    enabled: (!!option.neutralPreview && !!option.bodyRef) || bodyMockEnabled(),
    queryFn: ({ signal }) => loadNeutralPreview(option, signal),
    retry: false,
    staleTime: Infinity,
  });
  return query.data ? (
    <img src={query.data} className="h-full w-full object-contain" alt="" />
  ) : (
    <span className="p-2 text-center text-[11px] text-text-secondary">
      {query.isPending && query.fetchStatus !== "idle" ? "미리보기 준비 중" : "미리보기 없음"}
    </span>
  );
}

/** 실시간 3D: 캔버스 하나. 값이 바뀌면 다음 프레임에 한 번 다시 계산해 그린다. */
function ShapeCanvas({
  runtime,
  preset,
  controls,
  label,
  onFail,
}: {
  runtime: AnyShapeRuntime;
  preset: string;
  controls: Record<string, number> | null;
  label: string;
  onFail(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ShapeBodyView | null>(null);
  const fail = useRef(onFail);
  fail.current = onFail;
  useEffect(() => {
    if (!host.current) return;
    // 마운트마다 새 캔버스를 만든다. 해제할 때 컨텍스트를 강제로 잃게 하므로, 같은 캔버스를
    // 다시 쓰면(StrictMode 재마운트 등) 잃은 컨텍스트를 받게 된다.
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    canvas.setAttribute("role", "img");
    canvas.dataset.shapeCanvas = "";
    host.current.appendChild(canvas);
    try {
      view.current = mountShapeBody(canvas, runtime, () => fail.current());
    } catch {
      canvas.remove();
      fail.current(); // WebGL을 만들지 못했다 — 고정 그림으로.
      return;
    }
    return () => {
      view.current?.dispose();
      view.current = null;
      canvas.remove();
    };
  }, [runtime]);
  useEffect(() => {
    host.current?.querySelector("canvas")?.setAttribute("aria-label", label);
  }, [label]);
  useEffect(() => {
    try {
      view.current?.update(resolveControls(runtime, preset, controls), preset);
    } catch {
      fail.current();
    }
  }, [runtime, preset, controls]);
  return <div ref={host} className="h-full w-full" />;
}

/** 3D 자산을 못 쓸 때 Mock 모드에서만 쓰는 대체 실루엣(실제 렌더 아님). */
function MockSilhouette({
  option,
  controls,
}: {
  option: BodyLook;
  controls: Record<string, number> | null;
}) {
  const deferred = useDeferredValue(controls);
  const src = useMemo(
    () => bodyMock.livePreview(option.characterId, deferred),
    [option.characterId, deferred],
  );
  return <img src={src} className="h-full w-full object-contain" alt="" />;
}

/**
 * 체형 더보기의 왼쪽 큰 박스: 지금 이 인물에 고른 체형과 손대는 중인 값.
 * 조절 바를 움직이면 이 박스만 다시 그린다. 오른쪽 프리셋 카드는 고정 그림이다.
 *
 * 실시간 3D는 카탈로그가 `shapeRuntime`(standin-shape-runtime.v1/v2)을 주고, 자산 검증(해시·원본
 * 버전 일치)과 WebGL이 모두 될 때만 켠다. 아니면 고른 체형의 고정 그림을 보여 주고 그렇다고 적는다.
 */
export function LiveBodyView({
  option,
  name,
  controls,
  edited,
  rough,
  personIndex,
  variant,
  title = "내 체형",
  badge,
}: {
  option?: BodyLook;
  name: string;
  /** 조절 가능한 체형이면 지금 값(저장 전 값 포함). 고정 체형이면 null. */
  controls: Record<string, number> | null;
  edited: boolean;
  /** 원본 러프를 작게 겹친다. 작업 밖(설정 화면)에서는 넘기지 않는다. */
  rough?: { url?: string; box?: PersonBox | null };
  personIndex: number;
  variant: "bar" | "app";
  /** 박스 머리말. 후보 화면은 "내 체형", 설정 화면은 "내 기본값". */
  title?: string;
  /** 머리말 옆 표시. 없으면 edited일 때 "수정 중". 설정 화면은 저장 전일 때만 쓴다. */
  badge?: string | null;
}) {
  const ref = option?.shape ? option.shapeRuntime : undefined;
  const runtime = useShapeRuntime(ref);
  const [glFailed, setGlFailed] = useState(false);
  const live3d = !!option?.shape && !!runtime.data && supportedRuntime(ref) && !glFailed;
  const loading = !!option?.shape && supportedRuntime(ref) && runtime.isPending;
  const mockFallback = !live3d && !loading && !!option?.shape && bodyMockEnabled();
  const label = `${name}${edited ? " 수정" : ""} 미리보기`;

  return (
    <section
      aria-label={rough ? `인물 ${personIndex + 1}의 ${title}` : title}
      className={cn(
        "relative flex shrink-0 flex-col gap-1 rounded-xl border-2 border-brand-coral bg-surface-0 p-1.5",
        variant === "bar" ? "w-[150px]" : "w-[232px]",
      )}
    >
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-[11.5px] font-semibold text-text-primary">{title}</span>
        {(badge === undefined ? (edited ? "수정 중" : null) : badge) && (
          <span className="rounded-full bg-brand-coral px-1.5 text-[10px] font-semibold text-white">
            {badge === undefined ? "수정 중" : badge}
          </span>
        )}
      </div>
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2",
          variant === "bar" ? "h-[150px]" : "h-[248px]",
        )}
      >
        {!option ? (
          <span className="text-[11px] text-text-secondary">체형을 고르세요</span>
        ) : live3d && ref ? (
          <ShapeCanvas
            runtime={runtime.data!}
            preset={ref.preset}
            controls={controls}
            label={label}
            onFail={() => setGlFailed(true)}
          />
        ) : mockFallback ? (
          <MockSilhouette option={option} controls={edited ? controls : null} />
        ) : (
          <NeutralImage option={option} />
        )}
        {loading && (
          <span
            role="status"
            className="absolute inset-x-0 top-1 mx-auto flex w-fit items-center gap-1 rounded-full bg-surface-0/90 px-2 py-0.5 text-[10.5px] text-text-secondary shadow-sm"
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            3D 체형 불러오는 중
          </span>
        )}
        {/* 원본을 작게 겹쳐 둔다 — 체형을 러프와 비교하는 용도. */}
        {rough && (
          <div className="absolute bottom-1 left-1 flex flex-col items-center rounded-md border border-border bg-surface-0/90 p-0.5 shadow-sm">
            <RoughThumb
              url={rough?.url}
              box={rough?.box}
              personIndex={personIndex}
              className={cn(
                "border-0",
                variant === "bar" ? "h-[44px] w-[34px]" : "h-[72px] w-[54px]",
              )}
            />
            <span className="text-[9.5px] text-text-secondary">원본</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col px-0.5 pb-0.5">
        <span className="truncate text-[12px] font-semibold text-text-primary">
          {name}
          {edited ? " 수정" : ""}
        </span>
        <span className="text-[10px] text-text-secondary">
          {!option
            ? ""
            : !option.shape
              ? "고정 체형"
              : live3d || mockFallback
                ? "바를 움직이면 바로 바뀌어요"
                : loading
                  ? "처음 한 번만 받아요"
                  : edited
                    ? "수치 미리보기를 쓸 수 없어요 · 지금은 처음 모양만 보여요"
                    : "바를 움직여 조절하세요"}
        </span>
      </div>
    </section>
  );
}
