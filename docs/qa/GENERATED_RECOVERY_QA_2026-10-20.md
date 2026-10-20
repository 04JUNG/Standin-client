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
