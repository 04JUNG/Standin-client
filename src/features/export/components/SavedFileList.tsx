import { useState } from "react";
import { Check, Copy, GripVertical } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { dragService } from "../api/drag.service";

/**
 * 저장된 파일 목록(docs/03 §8, ADR-009).
 *
 * 각 행이 **드래그 소스**다. 데스크톱에서는 행을 클립스튜디오 캔버스로 바로 끌어놓을 수 있어
 * 탐색기를 거치지 않는다. 브라우저 개발 모드에서는 OS 드래그를 시작할 수 없으므로 드래그
 * 어피던스를 감추고 경로 복사만 남긴다.
 *
 * 경로 복사를 행마다 두는 이유: 다인 컷은 파일이 여러 개라 목록을 한 번에 복사하면
 * 클립스튜디오 임포트 대화상자에 붙여넣을 수 없다(docs/12 §3 폴백).
 */
type Props = {
  paths: string[];
  onCopy(path: string): Promise<boolean>;
  dense?: boolean;
};

function baseName(path: string): string {
  const cut = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return cut >= 0 ? path.slice(cut + 1) : path;
}

export function SavedFileList({ paths, onCopy, dense = false }: Props) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [droppedPaths, setDroppedPaths] = useState<string[]>([]);
  const [dragError, setDragError] = useState<string | null>(null);

  const canDrag = dragService.isSupported;

  async function handleCopy(path: string) {
    const ok = await onCopy(path);
    if (ok) {
      setCopiedPath(path);
      setFailedPath(null);
      window.setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1600);
    } else {
      // 복사되지 않았는데 "복사됨"이라고 알리지 않는다(CLAUDE.md §10).
      setFailedPath(path);
      setCopiedPath(null);
    }
  }

  /**
   * 웹뷰의 HTML5 드래그를 막고 OS 드래그로 넘긴다. preventDefault를 먼저 해야
   * 웹뷰가 자체 드래그 고스트를 만들지 않는다.
   */
  function handleDragStart(event: React.DragEvent, path: string) {
    if (!canDrag) return;
    event.preventDefault();
    setDragError(null);
    setDraggingPath(path);

    void dragService
      .startFileDrag([path], (outcome) => {
        setDraggingPath(null);
        if (outcome === "dropped") {
          setDroppedPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
        }
      })
      .catch(() => {
        setDraggingPath(null);
        setDragError("드래그를 시작할 수 없습니다. 폴더를 열어 파일을 직접 끌어놓아 주세요.");
      });
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className={cn("flex flex-col", dense ? "gap-1" : "gap-1.5")}>
        {paths.map((path) => {
          const copied = copiedPath === path;
          const failed = failedPath === path;
          const dragging = draggingPath === path;
          const dropped = droppedPaths.includes(path);

          return (
            <li
              key={path}
              draggable={canDrag}
              onDragStart={(e) => handleDragStart(e, path)}
              className={cn(
                "flex items-center gap-2 rounded-lg bg-surface-1 transition-colors",
                dense ? "px-2 py-1.5" : "px-3 py-2",
                canDrag && "cursor-grab active:cursor-grabbing hover:bg-surface-2",
                dragging && "opacity-60",
              )}
            >
              {canDrag && (
                <GripVertical
                  className={cn("shrink-0 text-text-secondary", dense ? "h-3.5 w-3.5" : "h-4 w-4")}
                  aria-hidden
                />
              )}

              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span
                  className={cn(
                    "truncate font-semibold text-text-primary",
                    dense ? "text-[11px]" : "text-[13px]",
                  )}
                >
                  {baseName(path)}
                </span>
                <span
                  className={cn(
                    "truncate text-text-secondary",
                    dense ? "text-[10px]" : "text-[12px]",
                  )}
                  title={path}
                >
                  {path}
                </span>
                {/* 드롭 결과는 OS 드래그 세션이 끝났다는 신호일 뿐, 대상 앱이 파일을
                    받았는지와 무관하다. 성공색(sky)으로 "전달됨"이라고 쓰면 클립스튜디오에
                    아무것도 안 들어간 경우에도 성공으로 읽힌다(작가 인터뷰에서 실제로
                    그렇게 읽혔다). 확인은 사용자에게 넘긴다(CLAUDE.md §10).

                    "놓았다"는 사용자가 방금 한 동작이라 되뇔 필요가 없다. 모르는 것(반영
                    여부)만 남기고 이유는 툴팁으로 내린다 — 다인 컷은 행이 여러 개라
                    행마다 한 문장이 붙으면 목록을 압도한다. */}
                {dropped && (
                  <span
                    className={cn("text-text-secondary", dense ? "text-[10px]" : "text-[12px]")}
                    title="앱은 파일을 넘기는 것까지만 알 수 있습니다. 클립스튜디오가 실제로 받았는지는 확인이 필요합니다."
                  >
                    반영됐는지 확인해 주세요
                  </span>
                )}
                {failed && (
                  <span
                    role="alert"
                    className={cn("text-brand-coral", dense ? "text-[10px]" : "text-[12px]")}
                  >
                    복사하지 못했습니다. 경로를 직접 선택해 복사해 주세요.
                  </span>
                )}
              </div>

              <button
                type="button"
                draggable={false}
                onClick={() => void handleCopy(path)}
                aria-label={`${baseName(path)} 경로 복사`}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded transition-colors",
                  dense ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 text-[12px]",
                  "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                )}
              >
                {copied ? (
                  <>
                    <Check className={dense ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className={dense ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
                    경로 복사
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {dragError && (
        <p role="alert" className={cn("text-brand-coral", dense ? "text-[10px]" : "text-[12px]")}>
          {dragError}
        </p>
      )}
    </div>
  );
}
