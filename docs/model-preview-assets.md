# 모델 미리보기 이미지 만들기

모델 화면과 선택 UI에 쓰는 남/여 체형 그림을 만드는 절차다.

## 원칙

⚠ **렌더 도구는 저장소 의존성 그래프에 들어가지 않는다.** three.js도, `@types/three`도,
`package.json`의 렌더 스크립트도 넣지 않는다. devDependency도 마찬가지다 — 결국 모든 CI
`npm ci`와 모든 기여자 설치에 들어간다.

클라이언트 3D 미리보기는 2026-08-05 `a31aeda`에서 한 번 걷어냈다. 실제 자세가 아니라 T자
뼈대가 나왔고 번들이 895 kB → 373 kB로 줄었다(ADR-005, ADR-013). 여기서 만드는 것은 **작성
시점에 한 번 렌더해 커밋하는 정적 PNG**다. 앱은 그림 파일만 안다.

**FBX 원본은 커밋하지 않는다.** 서버 에셋이고 수십 MB다. 렌더할 때만 로컬에 둔다.

## 만드는 법

### 권장 — Blender headless

```bash
blender --background --python render_model_preview.py -- <in.fbx> <out.png>
```

스크립트가 할 일:

- FBX import, frame 0(A 포즈)
- 고정 정사영 카메라(정면에서 살짝 3/4), 3점 조명, 무채색
- `scene.render.film_transparent = True`
- 해상도 512 × 768, 1프레임

재현 가능해서 모델 개정판이 나오면 그대로 다시 돌리면 된다.

### 대안 — Autodesk FBX Review(무료)

열어서 프레이밍 → 스크린샷 → 512 × 768로 크롭 → 배경 제거.
두 장이면 충분하지만 **재현 불가**다. 개정판이 나오면 손으로 다시 해야 한다.

### 하지 않을 것

- 저장소 안의 node/three.js 렌더 스크립트 (의존성 그래프)
- 런타임 렌더 (ADR-005)

이 문서의 스크립트는 **CI에서 돌지 않는다. 결과 PNG만 커밋한다.** 그래서 `scripts/`에도
넣지 않는다 — 그 폴더는 `.github/workflows/ci.yml`이 부르는 것들이 있는 자리다.

## 파일 규격과 자리

파일명은 converter의 `character_id`와 **바이트 단위로 같게** 둔다.

```
src/features/models/assets/standin-master-v2.png
src/features/models/assets/standin-female-v2-lbs.png
```

- 512 × 768 (2:3 세로), PNG-24 알파, 각 120 kB 이하
  (`oxipng`나 `pngquant`로 한 번 줄인다)
- 캐릭터당 한 장만 둔다. 나머지는 CSS로 줄여 쓴다 —
  모델 카드 ~260 px, `ModelSelect` 40 px, `BarModelSelect` 24 px

## 앱에 연결하기

`src/features/models/lib/previewImages.ts`의 map에 정적 import로 추가한다.

```ts
import maleV2 from "../assets/standin-master-v2.png";
import femaleV2Lbs from "../assets/standin-female-v2-lbs.png";

export const PREVIEW_BY_CHARACTER: Record<string, string | undefined> = {
  "standin-master-v2": maleV2,
  "standin-female-v2-lbs": femaleV2Lbs,
};
```

`characterId`로 파일명을 조합하지 않는다. 동적 import는 번들 그래프에서 빠져 개발에서는
되고 배포에서만 깨진다. 정적 import라야 파일이 없거나 이름이 바뀔 때 **빌드가 실패한다.**

map에 없는 id는 서버 `previewUrl`로, 그것도 없으면 플레이스홀더 아이콘으로 내려간다 —
그림이 없어도 화면은 깨지지 않는다.

PR 본문에 번들 영향을 적는다: 이미지는 별도 에셋으로 나가고 **JS 번들은 그대로**다.
그게 `a31aeda`와 이 변경을 가르는 지점이다.
