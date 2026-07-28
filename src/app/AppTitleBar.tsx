import { WindowControls } from "@/features/bar/components/WindowControls";

/**
 * 앱 모드의 제목 표시줄(ADR-008).
 *
 * 창을 항상 무장식으로 두므로 OS 제목 표시줄이 없다. 끌기는
 * `data-tauri-drag-region`이 처리한다(이 영역에는 클릭 요소가 없어 충돌하지 않는다).
 */
export function AppTitleBar() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-brand-ink text-white/90">
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center px-3 text-[12px] font-semibold"
      >
        Standin
      </div>
      <WindowControls />
    </div>
  );
}
