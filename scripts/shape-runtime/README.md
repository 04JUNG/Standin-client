# shape-runtime — 실시간 체형 미리보기 자산 만들기

`standin-shape-runtime.v1`(.ssr)은 체형 더보기의 "내 체형" 박스가 조절 바에 맞춰 기준 모델
(남성 0.7.1, 여성 0.3.3 — 이전 0.6.10·0.6.7·여성 0.2.2도 지원)을 앱 안에서 다시 그릴 때 쓰는 자산이다.

```bash
# Blender 모듈(pip bpy)이 있는 Python 3.11 — 0.6.10(근육 볼륨)은 필수
python3.11 -m venv .bpy && .bpy/bin/pip install bpy==5.0.1
.bpy/bin/python scripts/shape-runtime/build_runtime.py \
  --blend  .../male-body-v0.6.10/model/standin-body-0.6.10.blend \
  --controller .../male-body-v0.6.10/model/standin_body.py \
  --out    shape-runtime-0.6.10.ssr \
  --fixture src/features/body-selection/shapeRuntime/__fixtures__/mini-0.6.10.json
```

- 여성은 같은 명령에 `standin-female-body-0.2.2.blend`와 그 `standin_body.py`를 넘긴다(규칙은 컨트롤러의 `VERSION`으로 자동 판별).
- `bpy`가 있으면 Blender가 .blend를 열고 컨트롤러 자신의 `source()`가 잠금(basis·체형 키·topology·rig·웨이트)을 검사한다.
  `bpy`가 없으면 .blend를 직접 읽는다(Python 3 + numpy, 압축 .blend는 `zstd` CLI 또는 pip `zstandard`) — 0.6.7·여성만 된다.
  0.6.10의 근육 볼륨은 골격의 근육 볼륨 기준 웨이트가 필요해 `bpy`가 필수다. 두 경로의 0.6.7·여성 결과는 바이트까지 같다.
- 컨트롤러 `compute()`를 프리셋 + 모든 슬라이더 최소/최대 + 무작위 20조합(0.6.10은 근육 볼륨 조합 5개 추가)으로
  대조하고(`fold_guard` 끔), 0.05mm를 넘으면 멈춘다. `fold_guard`가 메시를 옮긴 조합은 `fold_guard_cases`
  (조합, 최대 이동 mm, 근육 볼륨)로 보고한다 — 0.6.7·여성은 0회라 앱이 건너뛰고, 0.6.10은 근육 볼륨이 있을 때 생겨 앱도 계산한다.
- `--fixture`는 부분 자산과 컨트롤러의 실제 출력(`fold_guard` 켬)을 만든다(`shapeRuntime/evaluate.test.ts`).
  0.6.7·여성은 정점 222개, 0.6.10은 메시 평활 때문에 검사 정점 4개와 그 6고리 이웃을 gzip으로 담는다.

## 해부 보정 층 (남성 0.7.1 · 여성 0.3.3)

```bash
.bpy/bin/python scripts/shape-runtime/build_runtime.py \
  --blend .../body-production-release-2026-10-16-v0.7.1-v0.3.3/male/model/standin-body-0.7.1.blend \
  --controller .../male/model/standin_body.py \
  --out shape-runtime-0.7.1.ssr \
  --fixture src/features/body-selection/shapeRuntime/__fixtures__/mini-0.7.1.json \
  --dump full-0.7.1.npz   # 선택: 모든 조합의 컨트롤러 출력(전체 메시 대조용)
```

- `anatomy.py`가 앞 버전 자료에 더해 `AD:<키>`(해부 평활 − 원래 키), `VN`·`PM`, 여성은 `FA`·`MR`·`PIN`·`EO`·`PV`와 상수 `bones`를 굽는다.
  bpy가 필수다(스킨 웨이트·뼈 휴지 자료).
- 이 규칙들은 `fold_guard`가 근육 볼륨 없이도 돌기 때문에 분해 검사를 `fold_guard` **켠** 출력과 비교한다.
- 테스트 자료는 검사 정점 5개와 10고리 이웃이고, `fold_guard`가 움직이지 않은 조합·근육 2 이하만 담는다.
- 전체 메시 대조: `--dump`의 .npz를 `<prefix>.bin`(케이스×정점×3 float64)·`<prefix>.json`(`names`, `controls`)으로 풀고
  `SHAPE_RUNTIME_FULL=<.ssr>:<prefix> npx vitest run evaluate.full` (기본은 건너뜀).

## 배포

1. 만든 .ssr을 서버의 승인 자산 위치에 두고 manifest의 조절 가능한 asset마다 적는다.
   ```json
   "shapeRuntime": { "path": "/srv/body/shape-runtime-0.6.10.ssr", "sha256": "<sha256>",
                     "bytes": 5322392, "format": "standin-shape-runtime.v1",
                     "rules": "standin-body-0.6.10", "preset": "BASE" }
   ```
   `preset`은 컨트롤러 프리셋 이름. 남성(0.6.10): BASE, IDEAL83, IDEAL70, TOON64, MUSCULAR, MUSCLE_MAX, BULK, SOFT, FAT_MAX.
   여성(`rules: "standin-female-body-0.2.2"`): BASE, SLIM, IDEAL83, IDEAL70, TOON64, MUSCULAR, MUSCLE_MAX, NEW_MUSCULAR, SOFT, FAT_MAX, NEW_FAT.
2. BFF가 `GET /v1/models/:characterId/shape-runtime/:sha256`으로 준다(`BODY_SHAPE_EDIT_ENABLED`일 때만).
3. 앱은 sha256·크기·형식·규칙을 검사하고, 모르는 규칙이면 고정 그림으로 떨어진다
   (지원: `standin-body-0.7.1`, `standin-body-0.6.10`, `standin-body-0.6.7`, `standin-female-body-0.3.3`, `standin-female-body-0.2.2`).

## 개발 Mock

- Vite 개발 서버: 만든 파일을 `public/mock/shape-runtime-0.7.1.ssr`, `public/mock/shape-runtime-female-0.3.3.ssr`에 두면 Mock 모드에서 실제 3D로 그린다
  (gitignore됨). 없으면 Mock 실루엣으로 떨어진다.
- 단일 HTML 목업: 빌드할 때 규칙별 gzip+base64로 `globalThis.__STANDIN_MOCK_SHAPE_RUNTIMES__`에 넣는다.

## 컨트롤러가 바뀌면

`standin_body.py`의 `mappings` / `compose_body` / `fat_connection_offset` / `compute` / `warp` /
`muscle_bulk_offset` / `refine_bulk_profile` / `fold_guard`가 바뀌면 `build_runtime.py`(남성 `bake`·`bake_bulk`·`coefs`·
`rest_body`·`evaluate`, 여성 `bake_female`·`evaluate_female`)와 앱의 규칙 모듈(`shapeRuntime/male0610.ts`,
`male067.ts`, `female022.ts`)을 함께 고치고, 새 규칙이면 `evaluate.ts`의 `EVALUATORS`에 더한다.

## v2: 버전에 매이지 않는 표본 자산 (`standin-shape-runtime.v2`, "SSR2") — 2026-10-16

규칙을 손으로 옮기지 않는다. Blender에서 컨트롤러 `compute()`를 직접 돌려 프리셋마다
조절 하나씩의 곡선(적응형 격자)과 서로 영향을 크게 주고받는 조절 쌍(3×3 격자)을 표본으로 뜨고,
모든 표본을 공통 PCA 기저(int16)로 줄인다. 앱(`shapeRuntime/sampled.ts`)은 선형 보간과 기저 합만 한다.
**모델 버전이 바뀌어도 앱 코드는 그대로이고 이 빌드만 다시 돌린다.**

```bash
# 1) 빌드 (남성 0.7.1 기준 9개 프리셋 약 50분 / 2 vCPU — 대부분 컨트롤러 계산 시간)
.bpy/bin/python scripts/shape-runtime/build_sampled_runtime.py \
  --blend <model>/standin-body-0.7.1.blend --controller <model>/standin_body.py \
  --out runtime-male-0.7.1.ssr --report runtime-male-0.7.1.json --basis-tol-mm 0.5 --max-basis 192
# 2) 새 시드로 독립 검사 + 크기 예산(32 MiB)에 맞게 기저 자르기
.bpy/bin/python scripts/shape-runtime/check_sampled_runtime.py --runtime runtime-male-0.7.1.ssr \
  --blend ... --controller ... --report check.json --truncate-basis 176 --selection-cut-ratio 2 \
  --out runtime-standin-body-0.7.1.ssr
# 3) 앱 테스트 고정 자료(프리셋 하나, 정점 150개, 빌더와 같은 계산의 정답 좌표)
.bpy/bin/python scripts/shape-runtime/make_sampled_fixture.py --runtime runtime-male-0.7.1-k160.ssr \
  --presets BASE,BULK --basis 48 --out src/features/body-selection/shapeRuntime/__fixtures__/mini-sampled.json
```

- 머리말 `source`(.blend·컨트롤러 SHA-256)가 카탈로그의 `shapeSource`와 같아야 앱이 쓴다.
  BFF도 다르면 서빙하지 않고, converter는 같은 원본으로만 굽는다(버전 가드).
- 리포트·머리말 `quality`: 프리셋별 컨트롤러 대비 최대 오차(mm). `few`=조절 2~6개를 프리셋 근처에서,
  `basic`=기본 조절 전부를 전 범위 무작위, `all`=모든 조절 전 범위 무작위(스트레스).
- 프리셋 모델 섞기(`selection: idw2`): 모든 프리셋 모델은 같은 함수를 다른 점 둘레에서 근사한다.
  앱은 지금 값에 가까운 모델들을 거리(조절 범위로 정규화)의 1/d²로 섞는다. 프리셋에서 멀리 움직일수록 정확도가
  크게 오른다(여성 풍만형 기본 조절 무작위: 중앙 29mm → 2mm).
- 빌드는 프리셋마다 표본을 `<out>.state/`에 남긴다. 중간에 끊겨도(메모리 부족 등) 같은 명령을 다시 돌리면 이어서 한다.
- 미리보기는 근사다. 저장되는 FBX와 검토 화면은 converter가 원본 컨트롤러로 굽는다.
