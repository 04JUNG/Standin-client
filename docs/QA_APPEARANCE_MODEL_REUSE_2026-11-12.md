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

2026-11-13 최신 main의 #221(조회 복구)·#222(다운로드 검증)·#225(바이너리 v2)·#226(릴리스 기록)을 확인했다. #223에 최신 main을 병합하고 #224에는 버전/릴리스 파일을 제외한 제품 변경을 반영했다. 아래는 그 통합 코드의 로컬 검증이며 운영에서 측정한 결과가 아니다.

서버는 새로운 선택마다 소유권·revision·파일 증거를 확인해야 한다. 서버의 geometry/snapshot 재사용은 별도 Converter 구현에 의존하며, 클라이언트가 prepare를 아예 생략하거나 서버 전체 계산 횟수 0을 보장하는 수정이 아니다. 본 PR은 운영/스테이징 배포·릴리스·설정 변경을 하지 않는다.

## 최초 준비와 503에 대한 통합 보완

- 바이너리 v2 모델은 직접 읽되, 작업 결과가 v2 지원을 명시하기 전에는 기존 BFF가 요구하는 정확한 v1 토큰을 보낸다. BFF rollback 시 명시적인 protocol 거부만 동일 body로 한 번 v1 재시도한다.
- 접수된 operation의 읽기 실패는 제한된 시간 동안 같은 operation을 재조회한다. 취소·revision 변경·무결성 오류는 성공으로 처리하지 않는다.
- BFF #200은 v1/v2 패킷 검증을 별도 bounded worker로 옮겨 HTTP event loop 정지를 막는다. #201은 중복 스킨 계약 조회를 줄인다.
- Converter #229는 몸체 metadata 및 검증된 health 자산 digest를 재사용한다. #230은 참조되지 않는 이전 선택 캐시를 정리하고, 용량·대기열·취소 오류를 구분한다. 검증·소유권·현재 revision 조건은 유지한다.

## 실제 Mac 앱 검수: 2026-11-13

Tauri 검수 앱(Standin Final QA) → 로컬 BFF 실제 InteractiveService·OperationStore·선택 resolver → 실제 Converter·Blender → 앱의 실제 Rust 파일 저장 명령을 실행했다. API 파일 전달만으로 완료 처리하지 않고, UI의 `저장 완료`와 디스크 파일 및 해시를 확인했다.

| 사례 | 앱에서 확인 | 디스크 파일 | SHA-256 |
| --- | --- | --- | --- |
| 기본 | 3D 표시·다운로드·저장 완료 | 9,067,820 bytes | `02bcb4c38365371b288880649690dc740a3eaa695e8fc5fcc7509dfc4571eb30` |
| 살색 | poll 503 두 번 후 같은 operation 복구·살색 3D·저장 완료 | 13,783,500 bytes | `8974276fa375ad7176dab9a98228991f2ed53ef872e687c9028cc2eb80ecc63e` |

기본→살색 사이 `/model` 추가 다운로드는 0회였다. 새 파일 준비·영수증 검증·파일 다운로드는 각각 수행했다. 살색 operation `op_3ae22817-0cc4-4794-9244-eb6615b24b95`는 서버 preview 준비 0.556초, 스킨 포함 export 단계 10.947초였다. 이미 준비된 geometry를 재사용한 로컬 warm 사례이고, 503 재시도와 사용자 조작 시간은 별도다. 최초 cold 생성이나 운영 SLA로 해석하면 안 된다.

실제 저장 파일을 Blender 5.2.0 LTS에서 다시 읽어 두 파일 모두 import 완료·139,474 vertices·armature 1개·67 bones·유한 좌표를 확인했다. 살색 파일에는 texture image 1개가 포함됐다. CSP 직접 표시 및 Windows 앱 저장 검수 결과는 아니다.

### 검수 환경과 실패 기록

- 검색 결과·설치 인증·카탈로그·선택 입력·객체 저장은 fixture다. 실제 검색/VLM, S3, PostgreSQL advisory locking, 운영 트래픽은 검증하지 않았다.
- 운영 키체인 권한 대화상자를 우회하지 않았다. 별도 QA 앱에서 가짜 로컬 인증을 공급했다. 제품 소스 491개를 비교해 인증 입력 1곳과 로컬 오류 진단 2곳만 QA 전용 차이임을 확인했다. 이 세 수정은 PR에 포함하지 않았다. 일반 OS 키체인 초기화 경로는 이 검수 범위가 아니다.
- 초기에 하네스 재시작이 revision을 1로 초기화해 Converter가 409로 거절했다. QA DB를 영속화하고 새 job으로 분리했다. 제품 revision 검증은 완화하지 않았다.
- 하네스가 응답 후 CORS 헤더를 누락해 앱의 model/file 검증이 실패했다. 실제 BFF CORS middleware로 교체한 뒤 같은 operation/파일로 앱 검수가 통과했다. 이 실패를 제품 서버의 새 원인으로 보고하지 않는다.
- 근거: `/private/tmp/standin-native-final-qa-20261112/`의 `control-plane.jsonl`, `native-saved-proofs.json`, `native-blender-reload.json`, `native-source-manifest.json`. 인증 파일·토큰은 저장소에 올리지 않는다.

main 대응 전체 테스트 1,705개, develop 대응 1,661개 통과(각 opt-in 6개 제외). 양쪽 build/typecheck 통과, lint 오류 0·기존 경고 2. PR CI와 실제 앱 QA는 별개다. 본 작업에서 main/develop 병합·운영/스테이징 배포·릴리스·인프라 적용을 실행하지 않았다.

## 추가 측정과 명시적 재시도

Converter HTTP만 따로 측정한 동일 기본형·동일 포즈 로컬 각 1회 비교다. BFF·앱 저장·네트워크 전송을 포함한 시간은 아니다.

| 조건 | 기존 v1 | v2 통합 |
| --- | --- | --- |
| cold file-ready | 57.49초 | 31.71초 |
| warm file-ready | 17.40초 | 0.206초 |

v2 geometry 준비 뒤 살색 첫 적용은 10.43초, 근육→살색 재선택은 0.610초였다. 반복 파일은 바이트가 같고, v1/v2 모델의 139,474정점·54뼈 모델은 정확히 일치했다. `/private/tmp/standin-final-preparation-qa-20261112/http-benchmark-v2-20261113/results.json` 및 `converter-benchmark-status.json`에 조건과 자산 pin이 있다.

서버 최초 capability가 unavailable이었던 경우 명시적 `다시 시도`가 이전 unavailable 값을 영구 재사용하는 문제도 발견했다. 재시도마다 현재 capability·revision을 다시 조회하되, 불확실한 POST의 mutation body는 유지하도록 보완했다. skin/outline 각각 disabled→enabled 회복과 기존 불확실 POST idempotency 회귀 테스트가 통과했다.

2인 살색 가이드선·외곽선 2 조합을 처음 시도할 때 로컬 Converter의 정식 `CONVERTER_OUTLINE_ENABLED` 설정이 꺼져 있어 두 번째 인물 prepare 전에 정확히 차단됐다. 로컬 설정만 켜고 재시작했다. 재시작 안전정책상 이전 snapshot은 만료되며 이를 우회하지 않았다.

Mac 잠금 해제 후 최신 복구 수정 앱을 다시 실행해 작업 기록에서 같은 2인 작업을 열었다. 재실행 후 외형 설정은 기본으로 돌아갔으므로 **2인 기본 스킨 저장 사례**로 기록한다. 이전 person 0 snapshot의 model 조회는 410으로 실패했지만, 앱에서 `다시 시도`를 눌러 새 revision으로 재준비했다. 두 인물의 3D가 표시되고 다운로드가 활성화돼 실제 Rust 저장 명령으로 FBX 두 개와 `저장 완료`를 확인했다. 두 파일은 각각 9,067,820·9,056,268 bytes이며 서버 delivery/receipt SHA와 일치한다. 앞선 1인 기본/살색과 합친 **실제 앱 저장 4파일 모두 Blender 재로드 통과**다. 2인 살색·외곽선 조합까지 UI에서 저장했다고 주장하지 않는다.

독립 API 매트릭스는 gray-guide·muscle·flesh-guide·flesh-muscle·outline2·flesh-guide+outline2·flesh-muscle+outline2·취소 후 gray-guide **8건 통과, 실패 0건**이다. 실제 v2 모델·FBX receipt·디스크 SHA를 검증했다. 503 두 번 뒤 같은 operation 유지, 동일 mutation 재전송 idempotency, 반복 변경 후 이전 revision supersede, 취소한 model/file의 409 차단, 취소 후 새 저장도 확인했다. UI 작업과 별도 DB/job/포트를 사용하고 기존 proof 14개를 보존했다.

정리된 비밀정보 없는 [검수 증거](qa/appearance_native_20261113.json)에 4개 앱 저장 파일과 API 8건의 해시·시간·복구 범위·한계를 남겼다.
