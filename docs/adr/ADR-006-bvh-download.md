# ADR-006: BVH 다운로드 방식

- 상태: 제안됨
- 날짜: 2026-07-14
- 관련 문서: docs/08_API_CONTRACT.md §8, docs/03_USER_FLOW_AND_SCREENS.md §8, docs/11_QA_SECURITY_RELEASE.md §3

## 배경

선택한 후보의 BVH를 사용자가 지정한 로컬 경로에 저장해야 한다. 서버가 파일을 어떻게 내려주는지(직접 바이너리 vs signed URL)와, 앱이 다운로드·저장을 어디(웹뷰 vs Rust)에서 처리하는지 결정해야 한다.

제약:

- 큰 결과 파일은 JSON base64보다 다운로드 URL 권장(docs/08 §1).
- 저장은 사용자 지정 경로, 기본 파일명 제공, 저장 후 폴더 열기(docs/03 §8).
- 서버 파일명 신뢰 금지, 경로 traversal 방지, 실행 파일로 저장 금지(docs/11 §3).

## 선택지

### 서버 전송 형식

- **A1. 후보별 다운로드 endpoint**(`GET /v1/pose-candidates/{id}/export?format=bvh`, 바이너리 + `Content-Disposition`).
- **A2. signed URL**(`{ downloadUrl, expiresAt }`) 반환 후 앱이 URL에서 내려받음.

### 다운로드·저장 위치

- **B1. Rust command에서 다운로드 + 저장 대화상자 + 파일 쓰기**(권장).
- **B2. 웹뷰(fetch)로 다운로드 후 Tauri fs로 저장**.

## 결정

전송 형식은 **A2(signed URL) 우선, A1 폴백**을 서버와 협의한다. 다운로드·저장은 **B1(Rust command)**로 처리한다.

근거:

- signed URL은 인증 헤더 노출 없이 큰 파일 전송에 유리하고 docs/08 §1 원칙에 부합. 서버가 signed URL을 못 주면 A1로 폴백.
- Rust에서 처리하면 저장 대화상자·경로 검증·파일명 정리를 네이티브 경계에서 안전하게 수행할 수 있다(docs/11 §3). 웹뷰 CSP/다운로드 제약도 피한다.

## 결과

- Rust command 예: `save_pose_file(downloadUrl | candidateId, defaultFileName) -> savedPath`. 저장 대화상자로 사용자가 경로 확정, 저장 후 `폴더 열기` 지원.
- 기본 파일명 규칙(docs/03 §8): 원본명이 있으면 `{originalName}_standin_pose.bvh`, 없으면 `standin_pose_YYYYMMDD_HHmm.bvh`.
- 서버가 준 파일명을 그대로 신뢰하지 않고 정리(sanitization)한다. 확장자는 `.bvh`로 강제하고 실행 파일 확장자를 허용하지 않는다.
- 저장 취소, 같은 파일명, 폴더 권한 없음, 다운로드 실패를 각각 처리(docs/11 §2 내보내기).
- signed URL 만료(`expiresAt`) 시 재발급 흐름을 서버와 합의.
- 서버팀 확인(docs/08 §11 Q9): BVH 사전 생성 여부와 export 방식.
- 재검토 조건: 후보마다 BVH가 사전 생성되지 않고 요청 시 생성된다면, 생성 대기 상태(Job) 처리를 추가한다.
