# shape-runtime — 실시간 체형 미리보기 자산 만들기

`standin-shape-runtime.v1`(.ssr)은 체형 더보기의 "내 체형" 박스가 조절 바에 맞춰 기준 모델
(남성 0.6.10, 여성 0.2.2)을 앱 안에서 다시 그릴 때 쓰는 자산이다.

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
   (지원: `standin-body-0.6.10`, `standin-body-0.6.7`, `standin-female-body-0.2.2`).

## 개발 Mock

- Vite 개발 서버: 만든 파일을 `public/mock/shape-runtime-0.6.10.ssr`, `public/mock/shape-runtime-female-0.2.2.ssr`에 두면 Mock 모드에서 실제 3D로 그린다
  (gitignore됨). 없으면 Mock 실루엣으로 떨어진다.
- 단일 HTML 목업: 빌드할 때 규칙별 gzip+base64로 `globalThis.__STANDIN_MOCK_SHAPE_RUNTIMES__`에 넣는다.

## 컨트롤러가 바뀌면

`standin_body.py`의 `mappings` / `compose_body` / `fat_connection_offset` / `compute` / `warp` /
`muscle_bulk_offset` / `refine_bulk_profile` / `fold_guard`가 바뀌면 `build_runtime.py`(남성 `bake`·`bake_bulk`·`coefs`·
`rest_body`·`evaluate`, 여성 `bake_female`·`evaluate_female`)와 앱의 규칙 모듈(`shapeRuntime/male0610.ts`,
`male067.ts`, `female022.ts`)을 함께 고치고, 새 규칙이면 `evaluate.ts`의 `EVALUATORS`에 더한다.
