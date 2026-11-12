# 빠른 미리보기 반신 절단면 / 어깨 확인

2026-11-12. 작업 브랜치 `codex/preview-crop-caps-20261112`, 기준 develop `d12a761`.
설치된 `/Applications/Standin Staging.app`의 표시 버전은 0.2.3이다.

## 원인과 변경

- 반신 구멍: `approvedModels.ts`가 중립 모델의 기준 높이 아래에 닿는 삼각형을
  통째로 버리고 절단면을 만들지 않았다. 기존 반신은 남성 89개 / 여성 106개 열린
  경계 edge가 있었다. 회전해 아래를 보면 몸통 내부가 그대로 보였다.
- 새 `crop.ts`는 절단 평면과 교차하는 면을 잘라 보존하고 닫힌 경계마다 cap을
  만든다. 원본 정점 ID를 유지하며 교차 정점의 몸체/손가락 skin weight와 sparse
  PSD offset도 보간한다. 범위별 모델은 캐시한다. full 자산은 그대로 재사용한다.
- 어깨: 이전 `referencePose`는 BVH rest offset 방향에 흉곽과 쇄골까지 정렬했다.
  승인 모델의 중립 골격과 BVH rest 골격 차이가 어깨 소켓을 이동시켰다. develop에는
  이미 structural bone의 motion delta를 보존하고 authoring corrective를 평가하는
  수정이 들어 있다. `staging-signed.56`의 pose.ts는 이전 버전이다. 이번 변경은
  develop의 어깨 수정을 유지하며 절단면 보간과 함께 검증한다. 어깨 수정 자체를
  이번 diff에서 새로 구현한 것으로 취급하지 않는다.

## 검증

- `NODE_OPTIONS=--no-experimental-webstorage npm test`: 202개 파일 / 1,565개 테스트
  통과, 외부 자산 검증 5개 skip. Node 26 기본 Web Storage와 jsdom의 충돌을 피하는
  기존 저장소 실행 옵션을 적용했다.
- 남녀 × half/bust/shoulder_head/head: 모든 edge가 정확히 두 면에 반대 방향으로
  연결된다. 원본 자산 불변, 새 정점/weight 계약, 범위 캐시, 팔을 든 포즈의 실제
  skinning 경로도 검사한다.
- 기존 어깨 golden 8개(남녀 × normal/slouch/raised/asymmetric) 통과. Blender 기준
  관절 오차 <0.3mm, 표면 표본 최대 오차 <2.5mm 기준을 유지한다.
- `npm run build` 통과. `npm run lint`는 오류 0, 기존 Fast Refresh 경고 2개.
- `git diff --check`, 변경 파일 Prettier 검사 통과.
- 브라우저 WebGL 비교 6/6 렌더링 완료. 남녀 반신을 아래쪽에서 봤을 때 이전 열린
  허리 대신 닫힌 단면이 보이는 것을 확인했다.

## 시각 비교 재현

```sh
npm run dev -- --host 127.0.0.1 --port 1421
```

`http://127.0.0.1:1421/tools/preview-crop-review/`를 연다. 같은 승인 모델과 저장소의
실제 BVH fixture를 이전 경로/수정 코드로 나란히 렌더한다. `.bin` 심볼릭 링크는
Vite의 자동 HTTP gzip 해제 없이 원래 압축 바이트의 SHA 검사를 실행하기 위한
검수 페이지 전용 별칭이다. 프로덕션 로더/무결성 검사는 바꾸지 않았다.

사용자가 첨부한 러프의 동일 job을 재실행한 검사는 아니다. 설치된 Staging 앱 교체,
서버 배포, release tag/PR 변경은 수행하지 않았다.
