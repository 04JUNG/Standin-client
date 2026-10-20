# 생성 포즈 오류와 복구 검증 (09·10)

전용 브랜치 `codex/generated-recovery-qa`. 원격 push/배포/설치본 변경 없음.

## 오류 계약

클라이언트는 서버 message를 표시하지 않고 code로 고정 한국어를 고른다.

| 코드 | 화면 동작 |
| --- | --- |
| GENERATED_SOURCE_UNAVAILABLE, PREVIEW_UNAVAILABLE | 원본을 확인하지 못했다는 안내, 후보 다시 고르기 |
| PREVIEW_SOURCE_CHANGED, PREVIEW_HASH_MISMATCH, CONVERTER_INTEGRITY | 원본/파일 불일치 안내, 후보 다시 고르기 |
| INVALID_EXPORT, INVALID_SELECTION, MANUAL_SELECTION_REQUIRED | 현재 작업에서 후보 다시 선택 |
| BODY_PREVIEW_STALE, HANDS_CHANGED, OUTPUT_SCOPE_CHANGED, PREVIEW_CHANGED | 현재 설정으로 최종 다시 확인 |
| MANUAL_REVIEW_REQUIRED, BODY_REVIEW_REQUIRED, HAND_REVIEW_REQUIRED | 확인 화면으로 이동 |
| CONVERTER_TIMEOUT, CONVERTER_FAILED, EXPORT_FAILED | 잠시 후 같은 요청 재시도 |
| CONVERTER_REJECTED | 다른 후보 선택 |

`poseRecovery.ts`가 메인/바 확인 및 저장 화면의 복구를 공유한다. 저장 오류는
`exportStore.errorCode`로 보존하고 원본 오류를 폴더 오류로 바꾸지 않는다.
다운로드 URL 누락은 INVALID_EXPORT로 거절한다. 명시적인 개발 mock 모드 외에는
대체 파일을 만들지 않는다. 서버 검사나 선택 권한은 완화하지 않는다.

## 검증 구분

자동 테스트는 fixture 기반이며 설치 앱/운영 작업으로 표현하지 않는다.
확인 화면에서 저장 차단, 후보 이동, 일시 오류 재시도를 앱·바 각각 렌더 테스트한다.
저장 hook에서 원본/설정/변환 오류마다 올바른 복구와 native 저장 미호출을 검사한다.

실제 Blender/생성/실메시 검증은 서버 워크트리의 검증 보고서에 별도 기록한다.

## 최종 통합 검증

선행 Client 완료 커밋 2eb6664를 ddafd42로 가져와 09 오류 복구와 통합했다.
기준 origin/develop fe78785, 워크트리 `/private/tmp/standin-generated-recovery-qa/client`.
추가 서버 오류 GENERATED_CHECKS_FAILED(기존 검사 탈락)도 후보 재선택으로 연결한다.

- `npm run build`, `npm run lint` 성공. 기존 Vite 500KB chunk 경고 있음.
- `NODE_OPTIONS=--no-experimental-webstorage npm test`: 970개 중 969 통과, 1 skipped.
- 메인/바 각각 생성-only, 생성+library 혼합 사진 선택/인물 집계/확정 이동/확대 버튼 없음을 검사했다.
- 생성+library 혼합 컷의 body review fixture 바이트가 각 인물 파일명으로 별도 전달됨을 검사했다.
- 체형/손/범위·후보/포함 변경 확인 무효화, 제외/재포함/작업/기록/소유자 선택 보존,
  원본 불일치/설정 변경/변환 실패의 저장 미호출과 복구 동작을 검사했다.
- 실제 생성/FBX 재열기·육안 검증은 서버의 `docs/GENERATED_RECOVERY_QA_2026-10-20.md` 참조.
  손·체형 수치/현재 모델 실메시, 설치 앱 native 저장·CSP는 미완료이며 자동 테스트로 대체하지 않는다.

최신 사용자 지시: 01(크게 보기/확대)은 제외. 사진을 눌러 선택하는 기존 동작을 유지한다. 생성 후보의 확대 버튼/모달은 제거했다.

## PR 검토 시 추가 실메시 확인

현재 로컬 등록 소스 male 0.7.2 / female 0.3.4의 정상 shape worker로 실제 생성 포즈를
검증했다. 남 height182/muscle.2/full/주먹+힘 뺀 손, 여 height172/physique.1/half/편 손+주먹의
파일/체형 정보가 일치했고 최종 FBX 재열기·렌더 육안 확인을 수행했다.
힘 뺀 손+편 손 조합은 손 자체 겹침 검사도 통과했다. 주먹 조합에는 기존 자체 겹침 경고가 남았고,
동일 라이브러리 포즈 대조군에서도 같은 경고가 관측됐다. 모든 손/충돌을 인증하지 않는다.
설치 앱 native 저장·CSP는 여전히 미검증이다. 상세 수치와 조건은 서버 보고서를 따른다.

PR 최종 안내 점검: 생성 포즈가 최종 형식 확인을 기다릴 때 내부 전송 형식 설명을 표시하지 않고, 새로 만든 포즈의 최종 모습 확인 안내만 제공한다.

서버가 최종 파일 변환 또는 paired 최종 확인을 지원하지 않는 생성 선택은 저장 확인을 차단한다. 원본 카드 이미지로 대체하지 않고, 다시 시도에서 분석 결과의 최신 지원 상태를 재조회한다.
