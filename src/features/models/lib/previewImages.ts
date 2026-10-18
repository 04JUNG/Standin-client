import maleV2 from "../assets/standin-master-v2.png";
import femaleV2Lbs from "../assets/standin-female-v2-lbs.png";
import child from "../assets/body-child.png";
import teenFemale from "../assets/body-teen-female.png";
import teenMale from "../assets/body-teen-male.png";

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
const LEGACY_PREVIEWS: Record<string, string | undefined> = {
  "standin-master-v2": maleV2,
  "standin-female-v2-lbs": femaleV2Lbs,
};

// The still image must match the exact FBX revision served by the BFF. If the
// server swaps a body asset, show the placeholder until its new image ships.
export const BODY_PREVIEWS: Record<string, { image: string; assetSha256: string }> = {
  "body-child": { image: child, assetSha256: "fefd87c5c904330bac8ac7b9cffbf25878f619386f2d4932fd27f03ec72b5c95" },
  "body-teen-female": { image: teenFemale, assetSha256: "c59e359e1dee699f46710d00143318191ce8788d16c2b95e5b4cbcc778ee0c45" },
  "body-teen-male": { image: teenMale, assetSha256: "1e7a7dc8542f4d0d84d778d8807cf615533513c96f7d091ef3d840c15ce7fd81" },
};

export function previewFor(characterId: string, assetSha256?: string): string | undefined {
  const body = BODY_PREVIEWS[characterId];
  if (body) return assetSha256 === body.assetSha256 ? body.image : undefined;
  return LEGACY_PREVIEWS[characterId];
}
