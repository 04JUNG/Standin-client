import { useRef, useState, type DragEvent } from "react";
import { Upload, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { ACCEPT_ATTR, SUPPORTED_LABEL, MAX_FILE_BYTES } from "../constants";
import { formatBytes } from "@/shared/lib/formatBytes";
import { useImageInput } from "../hooks/useImageInput";

/**
 * 홈 메인 Drop Zone(docs/04 §7). 드래그 앤 드롭 + 파일 선택.
 * Tauri v2에서는 window.dragDropEnabled=false로 두어 웹 표준 DnD를 사용한다.
 */
export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const { acceptFile, error, isProcessing } = useImageInput();
  const bindings = useShortcutStore((s) => s.bindings);

  // 파일 선택기의 소유자가 여기라서 단축키도 여기서 등록한다(ref를 위로 노출하지 않는다).
  useShortcuts({
    "home.openFilePicker": isProcessing ? undefined : () => inputRef.current?.click(),
  });

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="이미지 파일을 놓거나 선택"
        aria-disabled={isProcessing || undefined}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          isOver
            ? "border-brand-coral bg-brand-coral/5"
            : "border-border bg-surface-0 hover:border-brand-ink/30",
          isProcessing && "pointer-events-none opacity-70",
        )}
      >
        {isProcessing ? (
          <Loader2 className="h-8 w-8 animate-spin text-brand-ink" aria-hidden />
        ) : (
          <Upload className="h-8 w-8 text-brand-ink" aria-hidden />
        )}
        <div className="text-[16px] font-semibold text-text-primary">파일을 여기에 놓으세요</div>
        <Button variant="secondary" size="md" type="button" tabIndex={-1}>
          또는 파일 선택
          <ShortcutKey
            accelerator={resolveAccelerator("home.openFilePicker", bindings)!}
            className="ml-1"
          />
        </Button>
        <div className="text-[12px] text-text-secondary">
          {SUPPORTED_LABEL} · 최대 {formatBytes(MAX_FILE_BYTES)}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void acceptFile(file);
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-[13px] text-brand-coral">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
