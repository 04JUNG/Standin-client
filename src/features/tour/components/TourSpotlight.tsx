export type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  /** 강조할 요소의 모서리 반경 + 여백. 요소 곡률과 동심이 되도록 계산해 받는다. */
  radius: number;
};

/**
 * 강조 영역만 남기고 화면을 덮는다.
 *
 * 사각형 네 장으로 나눠 덮지 않는다. 그러면 구멍이 반드시 직각이라, 둥근 요소를
 * 강조할 때 모서리에서 딤과 테두리가 어긋난다(스테이징에서 실측). 아주 큰 spread를
 * 가진 box-shadow 하나로 구멍 바깥 전체를 덮으면 구멍이 border-radius를 그대로 따른다.
 *
 * 색은 bg-brand-ink/50로 쓰지 않는다. 브랜드색이 tailwind.config에서 var(--brand-ink)로만
 * 잡혀 있어 알파 수식자를 붙이면 Tailwind가 클래스를 아예 만들지 않는다(실측). 요소
 * 자체의 opacity를 쓰면 그림자에도 그대로 적용된다.
 *
 * 딤은 절대 입력을 가로채지 않는다 — 투어는 실제 앱을 따라가는 안내이므로 앱 조작을
 * 막지 않는다. 그만두기는 말풍선에 항상 있다.
 *
 * z-90은 캡처 오버레이(z-50)보다 위, 모달(z-100)보다 아래다.
 */
export function TourSpotlight({ rect }: { rect: SpotlightRect | null }) {
  // 강조할 곳이 없는 스텝(환영 카드 등)은 화면 전체를 덮는다.
  if (!rect) {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[90] bg-brand-ink opacity-50"
      />
    );
  }

  const { top, left, width, height, radius } = rect;
  const box = { top, left, width, height, borderRadius: radius };

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[90] opacity-50 shadow-[0_0_0_9999px_var(--brand-ink)]"
        style={box}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-[91] ring-2 ring-brand-sky"
        style={box}
      />
    </>
  );
}
