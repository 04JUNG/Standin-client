# 동적 검색 후보 표시

BFF의 후보 `source=dynamic|semantic`는 조회·비교용이다. `rankScore`는 정확도나 기하 거리로 표시하지 않는다.
새 정책 필드 `lookupAllowed`, `refineAllowed=false`, `releaseAllowed=false`, `actualMeshValidated=false`와
`searchCamera`를 보존한다. 구형 응답은 기존 표시를 유지한다. 알 수 없는 새 출처도 저장을 허용하지 않는다.

앱/바 공용 카드와 상태 안내가 경로·검색 오류·기본 구도·생성 검수 상태를 보여준다.
후보 이미지에는 정면 참고라는 의미를 표시하며 실제 검색 카메라와 같은 렌더라고 주장하지 않는다.
후보를 눌러 비교할 수 있지만 저장 확인은 진행되지 않는다. 강제로 저장 화면에 접근해도 저장 훅이 재검증한다.
refine 훅도 후보 자체 정책을 확인하므로 잘못 남은 인물 허용값으로 보정할 수 없다.
서버는 export/refine 요청을 별도로 거부한다.

## 실제 staging 빌드

기존 develop 자동 installer는 mock API를 사용하는 개발용이다. CI workflow_dispatch에서 `staging=true`를
명시하면 gate(frontend + Rust) 통과 후 macOS universal/Windows staging installer를 별도 artifact로 생성한다.
실제 API https://api-staging.standinpose.com, mock 플래그 2개 false, 별도 keyring/app identifier,
업데이터 endpoint 없음. GitHub release와 production 배포는 하지 않는다.

손·직접 자연어·다인 장면 등 신기능의 병합·연동 상태 표는 BFF `docs/ROUTED_SEARCH_INTEGRATION.md`에 기록한다.


## pose_presentation v1 (2026-10-18)

추론 PR #99(develop 831efd38)의 `people[].pose_presentation`이 non-null이면 표시 기준은 이 계약이다.
BFF는 인물별 `posePresentation`으로 전달하며 library/review/generated 그룹, 순위, 개별 검색·생성 상태, 카메라, scope, 정책을 보존한다.
null/미포함만 기존 dynamic_search 경로를 유지한다. 알 수 없는 버전·계약 오류는 오류 표시로 남기며 다른 후보로 대체하지 않는다.

BVH 본문과 내부 경로는 공개 결과 JSON에 포함하지 않는다. 기존 analysis_people.refine_context_json의
비공개 posePresentationAssets에 보관하므로 기존 작업 소유권·보관·삭제 정책을 따른다.
앱은 BFF의 `GET /v1/analysis/jobs/:jobId/people/:index/pose-previews/:candidateId/:sha256`만 사용한다.
라이브러리는 고정 추론 getPoseBvh를 통해 읽고 SHA를 확인한다. 생성은 UTF-8 본문 바이트의 SHA를 검증하며 라이브러리 조회하지 않는다.
소유권·후보·인물·해시 불일치는 404/409이고 임의 URL이나 다른 파일로 폴백하지 않는다.
이 조회는 preview 전용이며 export 권한이 아니다. 모든 신규 후보의 auto_apply/refine/export/release/actual_mesh_validated=false를 유지한다.

앱은 BVH frame 0의 관절을 Three.js로 렌더하고, hip midpoint 이동·hip-to-shoulder 길이 정규화 후
서버 rotation을 한 번 적용한다. 원근은 xy=(x,-y)/(z+distance_torso), 정사영은 xy=(x,-y)와 동등한 투영을 사용한다.
full/half/shoulder_head/head 범위를 적용하며 카메라 또는 범위가 유효하지 않으면 표시 실패를 알린다.
미리보기에서 좌우 회전과 기준 시점 복원이 가능하다. 관절 기반 뷰어이며 실제 체형 메시의 피부 안전 인증이나 보정·저장 기능은 제공하지 않는다.
기본 인체 계획은 미렌더 상태로 표시한다. 제공된 비공개 BVH/JSON은 Git에 올리지 않는다.
