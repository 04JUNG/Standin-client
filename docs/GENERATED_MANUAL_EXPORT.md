# 생성 포즈 수동 확인·개별 FBX 저장 (02~08)

2026-10-20. 기준 develop fe78785be035782dfc71118deb0c0dd48cbfa7f3.

생성 후보도 BFF의 `manualExportAllowed=true`, `lookupAllowed=true`, `bvhAvailable=true`,
`sourceBvhSha256`가 있으면 수동 선택할 수 있다. `source=generation`, `poseId=null`,
원래 candidateId를 유지한다. 검색 성공·자동 적용·자동 refine·완전한 메시 검증을 뜻하지 않는다.
알 수 없는 출처나 누락된 수동 권한은 선택 가능으로 바꾸지 않는다.

생성 후보만 있는 인물도 메인/바 공통 `canRelease` 집계에 포함된다. 사진 또는 `이 포즈 선택`으로
선택한다. 최신 사용자 지시에 따라 01(크게 보기/확대)은 지원하지 않는다. 확정은 기존 selections API를 사용한다.

다운로드 URL의 `:id`는 생성 후보의 실제 candidateId이며 라이브러리 pose ID가 아니다.
`framedExportUrl`이 기존 확인·저장 경로로 연결한다. 선택 체형·수치·손·범위의 최종 PNG/GLB를
확인한 후 서버가 보관한 동일 FBX를 내려받고 artifact SHA-256을 대조한다. 원본 카드 이미지는
최종 확인을 대신하지 않는다. 생성 후보의 원본 BVH 직접 다운로드는 최종 FBX 확인 경로를
대체하지 않는다. 생성 후보를 포함한 작업은 통합/v4 대신 인물별 파일을 저장한다.

후보 변경은 이전 refine 결과 및 최종 확인 URL/쿼리를 버린다. 체형·손·범위 변경도
최종 확인을 무효화한다. 서버는 변환 전후의 원본/설정/확정/변환기 버전을 다시 검사한다.
캐시에서 확인한 파일이 없어지면 다운로드 때 새 파일을 만들지 않고 재확인을 요구한다.

선택과 인물 제외 상태는 설치 소유자별 메모리에 최대 20개 작업 키로 보관한다.
라이브 UUID와 서버 job ID를 연결해 작업 기록 진입에서도 수동 선택을 보존한다.
확인 기록/다운로드 바이트/refine 결과는 이 보관함에 넣지 않는다. 설치 소유자가 바뀌면 비운다.
앱 재시작 이후에는 서버에 확정한 선택만 복원하며, 유효한 같은 candidateId만 복원한다.
과거 작업은 BFF manualExportVersion=2 마이그레이션으로 원래 체형·손·범위를 보존한다.

오류/복구 UI의 진입점은 `generatedPoseNotice.ts`, `PosePresentationPanel.tsx`이며,
BFF `manual_use_block_reason`은 `generation_unavailable|source_missing|source_changed|policy_unavailable`이다.
HTTP 오류 코드는 BFF [GENERATED_MANUAL_EXPORT.md] 계약을 따른다.

검증: `npm run typecheck`, `npm run build`,
`NODE_OPTIONS=--no-experimental-webstorage npm test`.
핵심 테스트는 `PoseSelectionPages.test.tsx`의 생성 전용 app/bar·사진 선택·확정·확대 버튼 없음,
`pose.http.test.ts`의 nullable 원본 식별/가짜 라이브러리 거부,
`poseSelectionStore.test.ts`의 제외/작업 전환/기록/소유자 복원,
`invalidateFinalReview.test.ts`의 확인 무효화다.
이 테스트의 이미지/자산은 fixture이며 실제 설치 앱/실제 FBX 검증을 의미하지 않는다.
