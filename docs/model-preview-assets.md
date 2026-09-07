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

## 만드는 법 (2026-09-07에 실제로 쓴 방법)

Blender가 설치돼 있지 않아 **저장소 밖 임시 폴더에 일회용 렌더 페이지**를 만들어 뽑았다.
three.js는 그 페이지가 CDN에서 직접 받으므로 이 저장소의 `package.json`에는 아무것도 늘지 않는다.

1. 임시 폴더(예: 스크래치패드)에 FBX 두 개를 복사하고 정적 서버를 띄운다.
   `file://`는 FBXLoader의 fetch가 CORS로 막히므로 `http://`여야 한다.
2. `index.html`에서 importmap으로 `three@0.160.0` + `three/addons/loaders/FBXLoader.js`를 받아
   다음 설정으로 렌더한다.
   - **576 × 768** — `ModelCard`의 `aspect-[3/4]`와 같은 비율. 다르면 카드에 여백이 생긴다.
   - 정사영 카메라. 모델 바운딩박스 높이에 맞춰 프레이밍하므로 **남녀 키·덩치 비율이 화면에서도
     유지된다** — 체형을 고르는 카드라 그게 중요하다.
   - yaw 18°. 정면 그대로면 어깨·골반 실루엣이 납작해 보인다.
   - HemisphereLight + 3점 DirectionalLight, 재질은 `map=null`·`color=0xd8d2c8`·`roughness=0.85`로
     통일(후보 썸네일 `warm-mannequin-v1`과 톤을 맞춘다).
   - `WebGLRenderer({ alpha: true, preserveDrawingBuffer: true })` + `setClearAlpha(0)` → 배경 투명.
3. `canvas.toDataURL("image/png")` 결과를 서버의 저장 endpoint로 POST해 파일로 떨군다.
4. **팔레트 양자화로 줄인다.** 마네킹은 무채색 그라데이션뿐이라 손실이 사실상 없다.
   ```python
   im.quantize(colors=255, method=Image.Quantize.FASTOCTREE,
               dither=Image.Dither.FLOYDSTEINBERG).save(out, optimize=True)
   ```
   실측: **127 kB → 16 kB**, 보이는 픽셀의 평균 색차 2.4/255·최대 8/255, 알파 비율 변화 없음.
   ⚠ RGBA는 `FASTOCTREE`나 `libimagequant`만 된다 — 기본 `MEDIANCUT`은 예외를 던진다.

모델 개정판이 나오면 같은 파라미터로 다시 돌리면 된다. Blender가 있는 환경이라면 headless
스크립트가 더 재현하기 쉽다(`--background --python`, `film_transparent = True`, 같은 해상도·각도).

### 하지 않을 것

- **저장소 안**의 node/three.js 렌더 스크립트 — 의존성 그래프에 들어간다. 위 페이지는 저장소
  밖 임시 폴더에서만 돌았고 커밋하지 않았다.
- 런타임 렌더 (ADR-005)

렌더 도구는 **CI에서 돌지 않는다. 결과 PNG만 커밋한다.** 그래서 `scripts/`에도 넣지 않는다 —
그 폴더는 `.github/workflows/ci.yml`이 부르는 것들이 있는 자리다.

## 파일 규격과 자리

파일명은 converter의 `character_id`와 **바이트 단위로 같게** 둔다.

```
src/features/models/assets/standin-master-v2.png      576×768, 16 kB
src/features/models/assets/standin-female-v2-lbs.png  576×768, 16 kB
```

- **576 × 768 (3:4 세로)** — `ModelCard`의 `aspect-[3/4]`와 같은 비율
- 8bit 팔레트 + 알파, 각 20 kB 이하
- 캐릭터당 한 장만 둔다. 나머지는 CSS로 줄여 쓴다 —
  모델 카드 ~260 px, `ModelSelect` 40 px, `BarModelSelect` 24 px.
  40 px에서는 T포즈가 작아 성별 구분이 잘 안 되지만, 타일에 이름 라벨이 함께 있어 이미지는
  보조 역할이다. 작은 크기용 상단 크롭도 시험해 봤지만 차이가 크지 않아 넣지 않았다

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
그게 `a31aeda`와 이 변경을 가르는 지점이다. 실측(2026-09-07): JS 446.72 → 446.86 kB
(**+0.14 kB**, import 경로 두 줄), PNG는 `dist/assets/`에 16 kB짜리 별도 파일 둘.
