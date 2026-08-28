import { cn } from "@/shared/lib/cn";

export type SpotlightRect = { top: number; left: number; width: number; height: number };

/**
 * 딤은 절대 입력을 가로채지 않는다.
 *
 * 처음에는 흐름 밖으로 새지 못하게 클릭을 막았는데, 그 때문에 후보를 못 고르는 일이
 * 생겼다 — 인물이 여럿이면 후보 그리드도 여럿이라 강조되지 않은 그리드가 딤에 덮이고,
 * 고정 오버레이가 휠 이벤트까지 먹어 main 스크롤도 멈췄다. 투어는 실제 앱을 따라가는
 * 안내이므로 앱 조작을 막지 않는다. 그만두기는 말풍선에 항상 있다.
 */
const DIM = "pointer-events-none fixed z-[90] bg-brand-ink/50";

/**
 * 강조 영역만 남기고 화면을 덮는다.
 *
 * 구멍 뚫린 오버레이 한 장이 아니라 상·하·좌·우 네 장으로 그린다. 한 장으로 덮으면
 * 강조한 요소까지 같이 어두워진다.
 *
 * z-90은 캡처 오버레이(z-50)보다 위, 모달(z-100)보다 아래다.
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
