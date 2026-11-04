import type * as THREE from "three";
import type { SearchCamera } from "./contract";
import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut, Move } from "lucide-react";
import type { StaticAsset } from "./contract";
import { acquireAsset } from "./assets";
import { initialObservation, type Observation } from "./camera";
import { invalidate, registerView } from "./renderer";
import { measure } from "./metrics";

// Session-only observation state survives main↔bar route remounts; never enters export identity or telemetry.
const observations = new Map<string, Observation>();
function observationFor(key: string) {
  if (!observations.has(key)) observations.set(key, initialObservation());
  return observations.get(key)!;
}
export type SurfaceView = { body: THREE.Group; camera: SearchCamera };
export function InteractivePose({
  asset,
  surface,
  viewKey,
  large = false,
  onExpand,
  onFrame,
}: {
  asset?: StaticAsset;
  surface?: SurfaceView;
  viewKey: string;
  large?: boolean;
  onExpand?: () => void;
  onFrame?: (element: HTMLElement) => void;
}) {
  const controlId = useId();
  const element = useRef<HTMLDivElement>(null);
  const observation = useRef(observationFor(viewKey));
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [retry, setRetry] = useState(0);
  const frame = useRef(onFrame);
  frame.current = onFrame;
  const gesture = useRef<{ x: number; y: number; pan: boolean; pointer: number }>();
  useEffect(() => {
    observation.current = observationFor(viewKey);
    if (!asset && !surface) {
      setStatus("failed");
      return;
    }
    const target = element.current!;
    const controller = new AbortController();
    const started = performance.now();
    let unregister: (() => void) | undefined, release: (() => void) | undefined;
    let first = true;
    setStatus("loading");
    // Only visible cards enter the bounded queue; DOM order puts Top-1 first.
    const visible = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      visible.disconnect();
      void (
        surface
          ? Promise.resolve({ body: surface.body.clone(true), release() {} })
          : acquireAsset(asset!, controller.signal)
      )
        .then((result) => {
          release = result.release;
          if (controller.signal.aborted) {
            release();
            return;
          }
          unregister = registerView({
            element: target,
            body: result.body,
            camera: surface?.camera ?? asset!.camera,
            observation: () => observation.current,
            layer: large ? 1 : 0,
            ready() {
              if (first) {
                first = false;
                setStatus("ready");
                measure("first-frame", started);
                frame.current?.(target);
              }
            },
            failed() {
              setStatus("failed");
            },
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus("failed");
        });
    });
    visible.observe(target);
    return () => {
      controller.abort();
      visible.disconnect();
      unregister?.();
      release?.();
    };
  }, [asset, surface, large, retry, viewKey]);
  const update = (fn: (value: Observation) => Observation) => {
    Object.assign(observation.current, fn(observation.current));
    observations.delete(viewKey);
    observations.set(viewKey, observation.current);
    while (observations.size > 64) observations.delete(observations.keys().next().value!);
    invalidate();
  };
  const reset = () => update(initialObservation);
  return (
    <div className="relative h-full w-full bg-surface-2">
      <div
        ref={element}
        role="application"
        aria-label="포즈 둘러보기"
        aria-describedby={controlId}
        tabIndex={0}
        className="h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-sky"
        style={{ touchAction: large ? "none" : "pan-y", cursor: "grab" }}
        onPointerDown={(event) => {
          if (event.button !== 0 && !(large && event.button === 2)) return;
          if (event.pointerType === "touch" && !large) return;
          event.stopPropagation();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            pan: large && (event.shiftKey || event.button === 2),
            pointer: event.pointerId,
          };
        }}
        onPointerMove={(event) => {
          const g = gesture.current;
          if (!g || g.pointer !== event.pointerId) return;
          const dx = event.clientX - g.x,
            dy = event.clientY - g.y;
          g.x = event.clientX;
          g.y = event.clientY;
          event.preventDefault();
          event.stopPropagation();
          update((o) =>
            g.pan
              ? { ...o, panX: o.panX - (dx * 0.003) / o.zoom, panY: o.panY + (dy * 0.003) / o.zoom }
              : {
                  ...o,
                  yaw: o.yaw - dx * 0.012,
                  pitch: Math.max(-1.5, Math.min(1.5, o.pitch - dy * 0.012)),
                },
          );
        }}
        onPointerUp={(event) => {
          if (gesture.current?.pointer === event.pointerId) {
            gesture.current = undefined;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          gesture.current = undefined;
        }}
        onLostPointerCapture={() => {
          gesture.current = undefined;
        }}
        onContextMenu={(e) => {
          if (large) e.preventDefault();
        }}
        onWheel={
          large
            ? (e) => {
                e.stopPropagation();
                update((o) => ({
                  ...o,
                  zoom: Math.max(0.25, Math.min(4, o.zoom * Math.exp(-e.deltaY * 0.001))),
                }));
              }
            : undefined
        }
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [0.12, 0],
            ArrowRight: [-0.12, 0],
            ArrowUp: [0, 0.12],
            ArrowDown: [0, -0.12],
          };
          const d = directions[event.key];
          if (d) {
            event.preventDefault();
            update((o) =>
              event.shiftKey && large
                ? { ...o, panX: o.panX + d[0], panY: o.panY + d[1] }
                : { ...o, yaw: o.yaw + d[0], pitch: Math.max(-1.5, Math.min(1.5, o.pitch + d[1])) },
            );
          } else if (event.key.toLowerCase() === "r") {
            event.preventDefault();
            reset();
          } else if ((event.key === "+" || event.key === "-") && large) {
            event.preventDefault();
            update((o) => ({
              ...o,
              zoom: Math.max(0.25, Math.min(4, o.zoom * (event.key === "+" ? 1.15 : 1 / 1.15))),
            }));
          } else if (event.key === "Enter" && onExpand) {
            event.preventDefault();
            onExpand();
          }
        }}
      />
      <span id={controlId} className="sr-only">
        방향키로 회전, R로 처음 시점, Enter로 크게 보기
      </span>
      {status !== "ready" && (
        <div
          className="pointer-events-none absolute inset-0 z-[20] flex items-center justify-center bg-surface-2 text-xs text-text-secondary"
          role="status"
        >
          {status === "loading" ? (
            "포즈 불러오는 중"
          ) : (
            <div className="pointer-events-auto p-3 text-center">
              <p>3D를 표시하지 못했어요</p>
              <button
                type="button"
                className="mt-2 rounded border px-3 py-1"
                onClick={() => setRetry((n) => n + 1)}
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      )}
      <div className="absolute right-2 top-2 z-[20] flex gap-1">
        <button
          type="button"
          aria-label="처음 시점"
          title="처음 시점 (R)"
          className="rounded-md border bg-surface-0 p-1.5"
          onClick={reset}
        >
          <RotateCcw size={15} />
        </button>
        {onExpand && (
          <button
            type="button"
            aria-label="크게 보기"
            className="rounded-md border bg-surface-0 p-1.5"
            onClick={onExpand}
          >
            <Maximize2 size={15} />
          </button>
        )}
      </div>
      {large && (
        <div className="absolute bottom-3 left-1/2 z-[20] flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-surface-0 p-2 text-xs">
          <button
            type="button"
            aria-label="축소"
            onClick={() => update((o) => ({ ...o, zoom: Math.max(0.25, o.zoom / 1.15) }))}
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            aria-label="확대"
            onClick={() => update((o) => ({ ...o, zoom: Math.min(4, o.zoom * 1.15) }))}
          >
            <ZoomIn size={18} />
          </button>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Move size={14} /> Shift + 드래그로 이동
          </span>
        </div>
      )}
    </div>
  );
}
export function ExpandablePose({
  asset,
  surface,
  viewKey,
  onFrame,
}: {
  asset?: StaticAsset;
  surface?: SurfaceView;
  viewKey: string;
  onFrame?: (e: HTMLElement) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const restore = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    restore.current = document.activeElement as HTMLElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.body.style.overflow = priorOverflow;
      restore.current?.focus();
    };
  }, [expanded]);
  return (
    <>
      <InteractivePose
        asset={asset}
        surface={surface}
        viewKey={viewKey}
        onExpand={() => setExpanded(true)}
        onFrame={onFrame}
      />
      {expanded &&
        createPortal(
          <div
            data-interactive-render-layer
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
            onClick={() => setExpanded(false)}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-label="포즈 크게 보기"
              className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface-0 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") setExpanded(false);
                if (e.key === "Tab") {
                  const nodes =
                    dialog.current!.querySelectorAll<HTMLElement>("button,[tabindex='0']");
                  const first = nodes[0],
                    last = nodes[nodes.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                  }
                }
              }}
            >
              <div className="relative z-[20] flex items-center justify-between border-b bg-surface-0 p-3">
                <span>포즈 둘러보기</span>
                <button type="button" aria-label="닫기" onClick={() => setExpanded(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <InteractivePose asset={asset} surface={surface} viewKey={viewKey} large />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
