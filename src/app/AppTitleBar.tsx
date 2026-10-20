import { isMac } from "@/shared/lib/platform";
import { WindowControls } from "@/features/bar/components/WindowControls";

/**
 * 앱 모드의 제목 표시줄(ADR-008).
 *
 * 단일 무장식 창을 앱·바·캡처 모드에서 공유한다. macOS 창 버튼은 왼쪽,
 * Windows/Linux 버튼은 오른쪽에 표시한다. 끌기는 버튼 밖의 제목 영역만 처리한다.
 */
export function AppTitleBar() {
  const mac = isMac();
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-brand-ink text-white/90">
      {mac && <WindowControls />}
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center px-3 text-[12px] font-semibold"
      >
        Standin
      </div>
      {!mac && <WindowControls />}
    </div>
  );
}
