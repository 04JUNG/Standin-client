# shape-runtime — 실시간 체형 미리보기 자산 만들기

`standin-shape-runtime.v1`(.ssr)은 체형 더보기의 "내 체형" 박스가 조절 바에 맞춰 확정 기준 모델
(남성 0.6.7, 여성 0.2.2)을 앱 안에서 다시 그릴 때 쓰는 자산이다. Blender 없이 .blend에서 바로 만든다(필요: Python 3 + numpy).

```bash
python3 scripts/shape-runtime/build_runtime.py \
  --blend  .../male-body-0.6.7-upperbody/standin-body-0.6.7.blend \
  --controller .../male-body-0.6.7-upperbody/standin_body.py \
  --out    shape-runtime-0.6.7.ssr \
  --fixture src/features/body-selection/shapeRuntime/__fixtures__/mini-0.6.7.json
```

- 여성은 같은 명령에 `standin-female-body-0.2.2.blend`와 그 `standin_body.py`를 넘긴다(규칙은 컨트롤러의 `VERSION`으로 자동 판별).
- 압축된 .blend는 `zstd`(CLI) 또는 `zstandard`(pip)로 푼다. 둘 다 없으면 `zstd -d`로 먼저 풀어서 넘긴다.
- 모델 안의 `asset_lock`(basis·체형 키·topology·rig 해시)과 맞지 않으면 멈춘다.
- 컨트롤러 `compute()`를 프리셋 8종 + 모든 슬라이더 최소/최대 + 무작위 20조합(총 92)으로 대조하고,
  0.05mm를 넘으면 멈춘다. `fold_guard`가 동작한 조합은 `fold_guard_cases`로 따로 보고한다(앱은 계산하지 않음).
- `--fixture`는 정점 222개짜리 부분 자산과 기대 좌표를 만든다(`shapeRuntime/evaluate.test.ts`).

## 배포

1. 만든 .ssr을 서버의 승인 자산 위치에 두고 manifest의 조절 가능한 남성 asset마다 적는다.
   ```json
   "shapeRuntime": { "path": "/srv/body/shape-runtime-0.6.7.ssr", "sha256": "<sha256>",
                     "bytes": 3412636, "format": "standin-shape-runtime.v1",
                     "rules": "standin-body-0.6.7", "preset": "BASE" }
   ```
   `preset`은 컨트롤러 프리셋 이름. 남성: BASE, IDEAL83, IDEAL70, TOON64, MUSCULAR, MUSCLE_MAX, SOFT, FAT_MAX.
   여성(`rules: "standin-female-body-0.2.2"`): BASE, SLIM, IDEAL83, IDEAL70, TOON64, MUSCULAR, MUSCLE_MAX, NEW_MUSCULAR, SOFT, FAT_MAX, NEW_FAT.
2. BFF가 `GET /v1/models/:characterId/shape-runtime/:sha256`으로 준다(`BODY_SHAPE_EDIT_ENABLED`일 때만).
3. 앱은 sha256·크기·형식·규칙을 검사하고, 규칙이 `standin-body-0.6.7`이 아니면 고정 그림으로 떨어진다.

## 개발 Mock

- Vite 개발 서버: 만든 파일을 `public/mock/shape-runtime-0.6.7.ssr`, `public/mock/shape-runtime-female-0.2.2.ssr`에 두면 Mock 모드에서 실제 3D로 그린다
  (gitignore됨). 없으면 Mock 실루엣으로 떨어진다.
- 단일 HTML 목업: 빌드할 때 규칙별 gzip+base64로 `globalThis.__STANDIN_MOCK_SHAPE_RUNTIMES__`에 넣는다.

## 컨트롤러가 바뀌면

`standin_body.py`의 `mappings` / `compose_body` / `fat_connection_offset` / `compute` / `warp`가 바뀌면
`build_runtime.py`(남성 `bake`·`coefs`·`evaluate`, 여성 `bake_female`·`evaluate_female`)와 앱의 규칙 모듈
(`shapeRuntime/male067.ts`, `female022.ts`)을 함께 고치고, 새 규칙이면 `evaluate.ts`의 `EVALUATORS`에 더한다.
