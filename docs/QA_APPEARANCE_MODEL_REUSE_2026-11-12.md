# 스킨·외곽선 변경 시 클라이언트 모델 재사용

## 문제와 변경

`interactive/session.ts`는 스킨·외곽선·슬라이더 편집 상태 변화도 전체 선택 변경과 같은 `invalidate()`로 보냈다. 이 함수가 `desired`를 지운 뒤 hook이 `select()`를 호출하면, 같은 포즈·체형·손인데도 새 base로 판단해 표시 모델과 연결 정보를 버렸다. 이후 새 operation의 큰 패킷을 다시 내려받고 `prepareSurface()`를 다시 실행했다.

외형만 바뀌면 파일 권한과 진행 중인 클라이언트 요청만 즉시 폐기하고, 표시 모델·base binding·손 draft를 유지한다. 슬라이더 이벤트마다 서버 cancel을 보내지 않는다. 마지막 선택의 prepare/export와 서버 revision 검증은 유지한다. 이미 표시한 모델과 **새 영수증의 packetModelSha256 및 runtimeRevision**이 같을 때만 추가 패킷 다운로드·파싱·표면 준비를 생략한다. 증거가 없거나 달라지면 기존 검증 경로로 새 패킷을 받는다. 이전 packet을 새 operation의 packet으로 위조하거나 이전 파일의 저장 권한을 재사용하지 않는다.

손 변경은 base/file binding을 바꾸되 pose binding은 유지한다. 기존 file binding에서 빠졌던 손 선택을 포함했다. 포즈·체형·범위·보정 변경은 전체 무효화를 유지한다. 스킨/굵기 변경 시 조합별 capability도 다시 조회해 이전 미지원 결과를 계속 사용하지 않는다.

## 검증 기준

- 실제 Zustand 선택 store에서 스킨·폭·편집 상태 변경이 appearance 무효화로 가고, 체형·후보 변경은 전체 무효화로 가는지 확인.
- 기본→살색에서 같은 geometry/runtime 영수증이면 model 요청 1회 유지, 새 prepare/export는 각각 수행.
- 외형 변경 직후 이전 파일 저장 거절, 새 영수증 완료 전 다운로드 비활성 유지.
- geometry 또는 runtime 증거 변경 시 새 model 요청. 손 변경 시 기존 모델 연결 폐기.
- 미지원 조합→유효한 스킨으로 변경 시 capability 재조회와 복구.
- 전체 테스트·typecheck·lint·build 결과는 PR에 기록.

## 실제 실행 범위와 한계

클라이언트 단위/통합 회귀 검증이다. 새 수정 앱의 Mac/Windows 네이티브 저장·CSP 표시·운영 E2E와 성능은 아직 측정하지 않았다. Mac 잠금 상태에서 화면 통과를 주장하지 않는다. 최초 준비 지연·BFF 503을 이 변경으로 해결했다고 주장하지 않는다.

서버는 새로운 선택마다 소유권·revision·파일 증거를 확인해야 한다. 서버의 geometry/snapshot 재사용은 별도 Converter 구현에 의존하며, 클라이언트가 prepare를 아예 생략하거나 서버 전체 계산 횟수 0을 보장하는 수정이 아니다. 본 PR은 운영/스테이징 배포·릴리스·설정 변경을 하지 않는다.
