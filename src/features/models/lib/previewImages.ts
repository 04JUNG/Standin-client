import maleV2 from "../assets/standin-master-v2.png";
import femaleV2Lbs from "../assets/standin-female-v2-lbs.png";

/**
 * 커밋된 모델 미리보기 이미지.
 *
 * characterId로 파일명을 조합하지 않는다 — 동적 import는 번들 그래프에서 빠져 개발에서는
 * 되고 배포에서만 깨진다. 정적 import라서 파일이 없거나 이름이 바뀌면 **빌드가 실패한다**.
 *
 * 이미지는 작성 시점에 한 번 렌더해 커밋한 정지 이미지다(docs/model-preview-assets.md).
 * 런타임에 3D를 그리지 않는다 — 클라 3D 미리보기는 2026-08-05 `a31aeda`에서 걷어냈다
 * (실제 자세가 아니라 T자 뼈대가 나왔고 번들이 895 kB → 373 kB로 줄었다, ADR-005).
 *
 * 여기 없는 id는 서버 `previewUrl`이나 플레이스홀더로 넘어간다.
 */
export const PREVIEW_BY_CHARACTER: Record<string, string | undefined> = {
  "standin-master-v2": maleV2,
  "standin-female-v2-lbs": femaleV2Lbs,
};

export function previewFor(characterId: string): string | undefined {
  return PREVIEW_BY_CHARACTER[characterId];
}
