import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * 저장된 파일 목록(docs/03 §8). 앱 모드와 바 모드가 같은 목록을 쓰고 밀도만 다르다.
 *
 * 경로마다 복사 버튼을 둔다 — 다인 컷은 파일이 여러 개라 목록 전체를 한 번에 복사하면
 * 클립스튜디오 임포트 대화상자에 붙여넣을 수 없기 때문이다(docs/12 §3 폴백).
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

  return (
    <ul className={cn("flex flex-col", dense ? "gap-1" : "gap-1.5")}>
      {paths.map((path) => {
        const copied = copiedPath === path;
        const failed = failedPath === path;
        return (
          <li
            key={path}
            className={cn(
              "flex items-center gap-2 rounded-lg bg-surface-1",
              dense ? "px-2 py-1.5" : "px-3 py-2",
            )}
          >
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
  );
}
