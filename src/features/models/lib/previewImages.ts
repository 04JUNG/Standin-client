import maleV2 from "../assets/standin-master-v2.png";
import femaleV2Lbs from "../assets/standin-female-v2-lbs.png";
import child from "../assets/body-child.png";
import femaleAthletic from "../assets/body-female-athletic.png";
import femaleBase from "../assets/body-female-base.png";
import femaleMuscular from "../assets/body-female-muscular.png";
import maleAthletic from "../assets/body-male-athletic.png";
import maleBase from "../assets/body-male-base.png";
import maleMuscular from "../assets/body-male-muscular.png";
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
  "body-female-athletic": { image: femaleAthletic, assetSha256: "db9e03eeb80320a39b13078e1a4b31c34851a7ad441b524dba6a010f36667965" },
  "body-female-base": { image: femaleBase, assetSha256: "b9e61699bbeb70a68de449381f8c927d5c33b48d2a0d528877ad90d3ed17542b" },
  "body-female-muscular": { image: femaleMuscular, assetSha256: "ae103edae56e0cfcfd8aca64325b20a5379deacc8ebbc19f90ed42b0506e4883" },
  "body-male-athletic": { image: maleAthletic, assetSha256: "db3b82f9102be22ce9976bf32e1218920603f6379d299da1982480dd5f78b804" },
  "body-male-base": { image: maleBase, assetSha256: "7c648b97a24a3bb4914b6e5d515708c33727979881d92ef916d5726e22301f3d" },
  "body-male-muscular": { image: maleMuscular, assetSha256: "5cc2ae55b83e85e45f81afe85d18111bf69e18223ec24ae7425260c87d7db4f4" },
  "body-teen-female": { image: teenFemale, assetSha256: "c59e359e1dee699f46710d00143318191ce8788d16c2b95e5b4cbcc778ee0c45" },
  "body-teen-male": { image: teenMale, assetSha256: "1e7a7dc8542f4d0d84d778d8807cf615533513c96f7d091ef3d840c15ce7fd81" },
};

export function previewFor(characterId: string, assetSha256?: string): string | undefined {
  const body = BODY_PREVIEWS[characterId];
  if (body) return assetSha256 === body.assetSha256 ? body.image : undefined;
  return LEGACY_PREVIEWS[characterId];
}
