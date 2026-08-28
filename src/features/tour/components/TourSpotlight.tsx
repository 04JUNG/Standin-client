import { cn } from "@/shared/lib/cn";

export type SpotlightRect = { top: number; left: number; width: number; height: number };

const DIM = "fixed z-[90] bg-brand-ink/50";

/**
 * 강조 영역만 남기고 화면을 덮는다.
 *
 * 구멍 뚫린 오버레이 한 장이 아니라 상·하·좌·우 네 장으로 그린다. 가운데에는 아무 요소도
 * 없어야 강조된 요소가 진짜 클릭 대상으로 남는다 — pointer-events:none으로 덮으면
 * 드롭존의 드래그 이벤트가 어긋난다.
 *
 * z-90은 캡처 오버레이(z-50)보다 위, 모달(z-100)보다 아래다. 투어 중에 대화상자가 뜨면
 * 대화상자가 위에 온다.
 */
export function TourSpotlight({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) return <div className={cn(DIM, "inset-0")} />;

  const { top, left, width, height } = rect;
  const bottom = top + height;
  const right = left + width;

  return (
    <>
      <div className={DIM} style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }} />
      <div className={DIM} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={DIM} style={{ top, left: 0, width: Math.max(0, left), height }} />
      <div className={DIM} style={{ top, left: right, right: 0, height }} />
      <div
        aria-hidden
        className="pointer-events-none fixed z-[91] rounded-xl ring-2 ring-brand-sky"
        style={{ top, left, width, height }}
      />
    </>
  );
}
