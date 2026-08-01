/**
 * 클립보드 복사. 저장된 BVH 경로를 클립스튜디오 임포트 대화상자에 붙여넣는 폴백 경로에 쓴다
 * (docs/12 §3, ADR-009).
 *
 * navigator.clipboard는 보안 컨텍스트를 요구하는데 Tauri 웹뷰가 항상 그 조건을 만족한다고
 * 보장할 수 없어서, 실패하면 execCommand로 한 번 더 시도한다. 두 경로가 모두 막히면 false를
 * 돌려 호출부가 "복사됨"이라고 잘못 알리지 않게 한다(CLAUDE.md §10).
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 폴백으로 넘어간다.
    }
  }

  if (typeof document === "undefined") return false;

  const area = document.createElement("textarea");
  area.value = text;
  // 화면 밖에 두되 focus가 가능해야 execCommand가 동작한다.
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);

  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
