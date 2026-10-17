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
