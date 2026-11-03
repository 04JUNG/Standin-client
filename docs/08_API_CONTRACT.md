# FastAPI 연동 계약 초안

## Top5 수평 8방향 미리보기 2026-10-21

일반 카드와 동적 라이브러리 카드의 공통 poster 로더가 기존 BFF `/poster` URL에 `variant=rough-yaw8-v1`을 추가합니다. BFF가 저장된 후보의 가까운 45도 이미지를 선택하며, 클라이언트는 S3 key나 조회 각도를 직접 결정하지 않습니다.

기존 source/scope/모델/revision/이미지 SHA 검증과 함께 실제 served yaw·요청 yaw·출처·폴백을 검사합니다. 승인된 native 512 JPEG를 지원합니다. `45° 방향 참고`, 의미 검색 기본 시점은 `기본 45° 방향 참고`, 누락 또는 카메라 없음은 `정면 참고`로 표시합니다. pitch·원근·최종 체형의 일치를 뜻하지 않습니다.

방향별 카드 요청은 2.5초 제한과 재시도를 적용합니다. source·candidate·scope·variant가 쿼리 키에 반영되며 이전 요청은 취소합니다. v2 실패 시 자동 체형 렌더·Converter·종이인형 폴백을 실행하지 않습니다. 구 BFF의 검증된 v1 인체 PNG는 정면 참고로 취급합니다.

생성 포즈는 기존 미리보기 경로를 유지합니다. 상세·최종 미리보기와 FBX는 기존 정밀 카메라를 사용합니다. 서버 자산/API → BFF → 클라이언트 순서로 적용하고 실제 러프·미러를 포함한 스테이징 확인 후 배포합니다.



## 기본 클로즈업 미리보기 연결 (로컬 구현, 2026-10-21)

BFF의 `basic_model.preview` (`basic-closeup-preview-v1`)가 있으면 기존의 인증된
`/v1/pose-candidates/default-body-template/{head|shoulder_head}`로 승인 기본 모델을
읽는다. 범위·모델·해시를 기존 loader로 검증하고 미리 잘라 둔 중립 메시를 렌더한다.
앱/바 공통 패널에서 로딩·미리보기·실패·재시도를 표시하며, 이 상태를 검색 실패나
"후보 없음"으로 표시하지 않는다. 구 BFF/잘못된 범위/자산/WebGL 오류는 명시적으로
불가 처리하며 전신·다른 모델·새 생성으로 대체하지 않는다.

기본 모델은 검색/생성 후보가 아니며 선택·저장 수에 포함하지 않는다. 기존
export/refine 정책과 검색 후보 흐름은 유지한다. 고개 기울기·방향을 맞추지 않으므로
"기본 체형 · 중립 자세 참고"로 안내한다. BFF 배포와 새 앱 설치가 함께 필요하다.
추론 서버/Converter 알고리즘·인프라 변경은 필요 없다. 로컬 변경이며 배포하지 않았다.

## v4 보정 장면 최종 확인 (scene-save-v1)

앱/바의 명시적 original-selection / auto-correct-v4 선택, prepare/confirm 버전·SHA·만료,
서버 summary와 오류 복구 계약은 [통합 FBX 저장 UI](SCENE_SAVE_UI.md)를 따른다.
새 capability.sceneSaveContract가 있어야 v4를 요청한다. 구 `{persons}` 요청은 v4 flag와
무관하게 기본 통합 저장이다. 자동 보정 실패를 다른 저장 모드로 조용히 바꾸지 않는다.
기본 기능 스위치는 BFF에서 꺼져 있다. 로컬 fixture와 실제 설치 Staging 검증을 구분한다.

## 선택 품질 검토 동의 (2026-10-19)

기본 설치 동의(`consentVersion`)와 선택 품질 동의(`qualityConsent.version`)는 별개다.
기존 설치 자격증명을 유지하고 선택 동의를 미리 체크하지 않는다.

등록 `POST /v1/installations`에 아래 필드를 추가한다.

```json
{ "qualityConsent": { "version": "2026-10-19", "personalData": false, "contentLicense": false } }
```

`GET /v1/installations/current/quality-consent`로 현재 상태를 읽고 같은 경로의 PUT에
`{ version, personalData, contentLicense }`를 보내 저장한다. 설치 인증을 사용한다.
등록 응답의 `qualityConsent` 및 GET/PUT 응답은 이 필드들과 `consentId`, `grantedAt`을
포함한다. 두 선택 항목이 모두 true일 때만 두 값이 존재하며, 아니면 null이다.

- 첫 실행은 필수 기본 약관 확인만으로 진행할 수 있다. 품질 검토는 두 항목 모두 선택해야 켜진다.
- 기존 설치는 자격증명을 다시 발급하지 않고 서버 상태를 조회한다. 조회 실패 시 기본 기능은
  계속 사용하고 품질 이벤트는 수집하지 않는다.
- 설정에서 한 항목이라도 해제해 저장하면 품질 검토만 철회한다. 전체 데이터 삭제는 별도다.
  저장 실패 시 완료로 표시하지 않고 재시도한다. 같은 앱 실행 중에는 창의 포커스가 돌아와도
  미완료 변경을 지우거나 이벤트 수집을 재개하지 않는다. 앱 재실행 시 서버 상태를 다시 조회한다.
- 이벤트 큐는 현재 `consentId`별로 분리한다. 미동의·철회·재동의 때 이전 큐를 버리고,
  배치 최상위 및 피드백 요청에 `qualityConsentId`를 보낸다. 오래된 ID는 서버에서 제외한다.
  PC 시계가 조금 느리더라도 동의 직후 새 이벤트가 동의 이전으로 기록되지 않도록
  `occurredAt`의 하한을 서버 `grantedAt`으로 둔다. 기존 큐의 시각/동의 ID는 바꾸지 않는다.
- 후보 확정 및 내보내기는 품질 동의 여부와 무관하게 정상 요청한다. 선택 피드백은 동의한 경우만 표시한다.
- 새 동의는 이후 업로드에만 적용된다. 과거 Job의 검토·피드백은 서버가 거부한다.

앱보다 BFF의 모든 API/워커 인스턴스를 먼저 교체한다. 기존 설치·기존 Job을 자동 동의로
옮기지 않는다. [화면 확인 기록](qa/optional-quality-consent.md)에 검증 범위를 기록한다.

## 동적 검색 조회 전용 후보 (2026-10-17)

`candidatesByPerson[].routedSearch`는 route/status/reason, 근접·구도 참고 개수, 별도 생성 검수 상태,
기본 인체 여부를 보존합니다. `candidates[].source=dynamic|semantic`인 후보는 `rankScore`를 가지며
기하 `distance`로 변환하지 않습니다. `lookupAllowed=true`, `refineAllowed=false`,
`releaseAllowed=false`, `actualMeshValidated=false`, `reviewRequired=true`, `bvhAvailable=false`입니다.
`searchCamera`는 검색 카메라 메타데이터이며 기존 정렬 렌더 camera 계약과 구별합니다.

`GET /v1/pose-candidates/:id/lookup-thumbnail?jobId=...&personIndex=...&candidateId=...`는
소유권·후보 ID·포즈를 검증한 정면 참고 이미지를 제공합니다. 검색 시점의 정렬 렌더라고 표시하지 않습니다.
해당 후보의 refine은 409 `CANDIDATE_REFINE_FORBIDDEN`, BVH/FBX/framed FBX 저장은
409 `CANDIDATE_RELEASE_FORBIDDEN`으로 거부합니다. 생성·근접·구도·기본 인체 결과는 정식 후보로 합치지 않습니다.
상세는 [동적 검색 연결](ROUTED_SEARCH_INTEGRATION.md)을 참조합니다.

카메라 후보의 `quickThumbnailUrl`은 이미 렌더된 JPEG를 가리키는 선택 필드다.
후보 카드에서 빠른 근사 시점으로만 쓰고, `thumbnailUrl`과 저장 전 확인 계약은
기존처럼 최종 결과를 검증한다. 필드가 없는 구 BFF는 기존 카드 로딩 경로를 쓴다.

## 모델 미리보기 확장 (2026-10-08)

`capabilities.modelPreview`(없으면 false)가 true인 FBX 확인 화면은
`/framed?format=model`에서 정적 GLB를 받는다. 저장은 동일 조건의
`format=fbx&previewType=model`을 요청해 준비한 FBX를 재사용한다.
이 경로의 refine POST에만 `deferPreview:true`를 보낸다. BVH/구 서버는 기존 계약을 유지한다.
모델은 최종 카메라/범위가 이미 적용된 `framed-mesh-v1`이다. 전신 원본은 기존
`posed-mesh-v1`을 후보 회전행렬로 표시하면서 FBX를 준비할 수 있다.
리파인 또는 부분 출력에는 원본 모델을 사용하지 않는다.

WebGL 실패 시 같은 범위/체형의 PNG로 대체하고 그 PNG와 짝인 FBX로 저장한다.
WebGL 2 미지원 기기는 모델 변환을 요청하거나 refine PNG를 생략하기 전에 기존 경로를 선택한다.
모델 첫 프레임이나 PNG가 준비되기 전에는 저장을 잠근다. 정적 모델은 화면에 유지하고
크기 변경 시에만 다시 그리며 화면을 떠나면 GPU 자원을 해제한다.

> 서버 코드는 이 레포에 포함하지 않는다. 이 문서는 앱과 서버 팀이 합의할 계약의 초안이다.

## 1. 기본 원칙

- 모든 시간은 ISO 8601
- ID는 string
- 오류 형식 통일
- 큰 결과 파일은 JSON base64보다 다운로드 URL 사용
- 분석은 Job 기반
- 앱 버전과 API 버전 호환 정책 필요
- 서버가 제공하지 않는 진행률을 앱이 임의로 만들지 않음

---

## 2. 공통 응답

### 오류

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials",
    "details": null,
    "requestId": "req_123"
  }
}
```

앱은 서버 message를 직접 표시하지 않고 code를 사용자 메시지로 매핑한다.
매핑은 `src/shared/api/errorMessages.ts`가 소유하고, `toAppError`/`messageOf`를 거쳐 화면에 나간다.

### 사용량 제한 (`429`) · 서비스 중단 (`503`)

오픈베타는 로그인 없이 설치 단위로 쓰므로 서버가 사용량을 강제한다(BFF `docs/API.md`
「사용량 제한」). 초과 응답은 `429`와 함께 **언제 다시 쓸 수 있는지**를 `details`와
`Retry-After` 헤더로 준다. 앱은 원인과 다음 사용 가능 시점을 함께 표시한다.

```json
{
  "error": {
    "code": "DAILY_QUOTA_EXCEEDED",
    "message": "오늘 사용할 수 있는 분석 횟수를 모두 사용했습니다.",
    "details": {
      "retryAfterSeconds": 41230,
      "limit": 10,
      "retryAt": "2026-08-12T00:00:00.000+09:00"
    },
    "requestId": "req_..."
  }
}
```

| code | 상태 | 언제 | `details` |
|---|---:|---|---|
| `DAILY_QUOTA_EXCEEDED` | 429 | 설치별 일일 분석 한도 초과 | `retryAfterSeconds`, `limit`, `retryAt` |
| `GLOBAL_QUOTA_EXCEEDED` | 429 | 서비스 전체 일일 한도 초과 | `retryAfterSeconds`, `retryAt` |
| `CONCURRENCY_LIMIT` | 429 | 같은 설치에 진행 중인 분석이 있음 | `retryAfterSeconds`, `limit` |
| `RATE_LIMITED` | 429 | 짧은 시간에 요청이 몰림(IP 단위) | `retryAfterSeconds`, `limit`, `windowSeconds` |
| `SERVICE_PAUSED` | 503 | 운영자가 분석을 중단함(kill switch) | 없음 |

- `retryAt`은 KST(`+09:00`) 표기다. 화면에는 사용자 기기의 로컬 시각으로 바꿔 보여준다.
- **한도 숫자를 앱에 하드코딩하지 않는다.** 서버 환경변수로 조정되므로 `details.limit`을 그대로 쓴다.
- `SERVICE_PAUSED`는 재시도 시각을 줄 수 없으므로 자동 재시도 루프를 돌리지 않는다.
- `RATE_LIMITED`는 일일 쿼터와 별개 카운터다. 남은 일일 횟수가 있어도 잠깐 몰리면 나온다.
  공용망·NAT에서는 같은 IP를 여러 사용자가 공유할 수 있다.

---

## 3. 인증

### 로그인

```http
POST /v1/auth/login
Content-Type: application/json
```

Request:

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

Response:

```json
{
  "accessToken": "...",
  "accessTokenExpiresAt": "2026-07-14T12:00:00Z",
  "refreshToken": "...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "displayName": "작가"
  }
}
```

### Refresh

```http
POST /v1/auth/refresh
```

### Logout

```http
POST /v1/auth/logout
```

### Current User

```http
GET /v1/users/me
```

---

## 4. 분석 Job 생성

```http
POST /v1/analysis/jobs
Content-Type: multipart/form-data
Authorization: Bearer ...
```

Form:

```text
file: image
source: file | capture | clipboard
rerunOfJobId?: string
```

Response:

```json
{
  "jobId": "job_123",
  "status": "queued",
  "createdAt": "2026-07-14T12:00:00Z"
}
```

---

## 4-1. 작업 기록 목록

```http
GET /v1/analysis/jobs?limit=20&cursor=...&status=completed
```

최신순 커서 페이지네이션. `limit`은 1~50(기본 20)이고 범위 밖이거나 손상된 `cursor`는 `400 INVALID_INPUT`이다 — 조용히 첫 페이지로 폴백하면 "더 보기"가 같은 페이지를 무한 반복한다.

```json
{
  "items": [
    {
      "jobId": "job_123",
      "status": "completed",
      "createdAt": "...",
      "completedAt": "...",
      "errorCode": null,
      "source": "capture",
      "personCount": 2,
      "selectionCount": 2,
      "hasSelection": true,
      "thumbnailUrl": "/v1/pose-candidates/{poseId}/thumbnail?view=front",
      "inputAvailable": true,
      "inputWidth": 1920,
      "inputHeight": 1080
    }
  ],
  "nextCursor": "eyJ..."
}
```

`nextCursor`가 `null`이면 마지막 페이지다.

`thumbnailUrl`은 **입력 러프가 아니라 매칭된 포즈 후보**의 썸네일 경로다(확정 선택한 후보 우선, 없으면 첫 인물의 1순위). 원본을 20건 내려보내면 수십 MB지만 후보 썸네일은 이미 하루 캐시되는 작은 PNG다. 인증 헤더가 필요한 상대 경로이므로 `<img src>`에 그대로 넣지 않고 blob으로 받는다.

`inputAvailable`은 입력 원본이 아직 서버에 있는지다. **기본 원본·사용자 작업 이력은 최대 90일**이다. 별도 품질 검토 동의를 받은 연결 평가정보의 최대 365일 보관은 사용자 이력 만료일을 연장하지 않는다.

---

## 4-2. 작업 기록 삭제

```http
DELETE /v1/analysis/jobs/{jobId}
```

```json
{ "deleted": true }
```

작업과 분석 결과, 원본 이미지를 함께 지운다. 되돌릴 수 없으므로 앱은 확인 대화상자를 거친다.

진행 중(`queued`/`running`)이면 `409 JOB_IN_PROGRESS`다. 앱은 "진행 중인 분석은 삭제할 수 없습니다"로 안내한다. 계정(설치) 전체 삭제는 `DELETE /v1/installations/current/data`가 담당한다.

---

## 4-3. 확정 선택 조회

```http
GET /v1/analysis/jobs/{jobId}/selections
```

```json
{
  "selections": [
    { "personIndex": 0, "candidateId": "pose-1::front", "rank": 1, "confirmedAt": "..." }
  ]
}
```

작업 기록에서 지난 작업을 열 때 그때의 선택을 화면에 되살리는 데 쓴다(ADR-012). Job 상태 폴링 응답에 얹지 않은 것은 그 경로가 분석 중 반복 호출되기 때문이다.

---

## 5. Job 상태

```http
GET /v1/analysis/jobs/{jobId}
```

Response:

```json
{
  "jobId": "job_123",
  "status": "pose_search",
  "stage": {
    "code": "POSE_SEARCH",
    "label": "가까운 포즈 검색 중",
    "current": 3,
    "total": 5
  },
  "createdAt": "2026-07-14T12:00:00Z",
  "updatedAt": "2026-07-14T12:00:08Z",
  "error": null
}
```

`status="failed"`일 때 `error`에 실패 사유 코드가 들어온다. 현재 BFF가 주는 값:

| `error` | 의미 | 앱 처리 |
|---|---|---|
| `INFERENCE_FAILED` | 추론 호출 실패 | "다른 이미지로 다시 시도" |
| `INPUT_STORAGE_FAILED` | 입력 이미지 보관 실패 | 재시도 |
| `ABANDONED` | 배포·태스크 교체로 진행 중 Job이 유실됨 | "분석이 중단됐습니다. 다시 시도" |
| `ANALYSIS_UNAVAILABLE` | AI 혼잡 또는 구 서버의 상세 원인 없는 503 | 잠시 후 재시도 |
| `ANALYSIS_RATE_LIMITED` | AI 제공 서비스의 일시적 요청 한도 | 잠시 기다린 뒤 재시도 |
| `ANALYSIS_DAILY_QUOTA_EXHAUSTED` | AI 제공 서비스의 일일 한도 소진 | 한도 복구/운영자 확인 안내, 재시도 버튼 숨김 |
| `ANALYSIS_UPSTREAM_TIMEOUT` | AI 제공 서비스 응답 시간 초과 | 잠시 후 재시도 |
| `ANALYSIS_UPSTREAM_ERROR` | AI 제공 서비스 일시 오류 | 잠시 후 재시도 |

새 AI 실패 코드는 `shared/api/analysisJobFailure.ts`에서 안전한 고정 문구와 재시도 여부로
바꾼다. 실시간 결과와 작업 기록에 같은 원인을 표시한다. 사용자의 설치별 사용량 한도와
AI 제공 서비스 한도를 혼동하지 않으며, 초기화 시각이나 정확한 대기 초를 추정하지 않는다.
자동 재시도는 추가하지 않는다. BFF의 기존 코드/미지원 코드는 기존 처리를 유지한다.
새 BFF 배포 전에 이 클라이언트를 배포해야 한다. 이미 설치된 데스크톱 앱에는 새 빌드/업데이트가
필요하며, develop 머지만으로 설치된 앱이 바뀌지는 않는다. 과거 실패 기록은 재분류하지 않는다.

`ABANDONED`는 러너가 아직 프로세스 내 fire-and-forget이라 생긴다. 서버가 주기적으로
정리해 무응답 대신 명시적 실패로 만들어 준다. 앱은 이 값을 `analysis_failed.reason`에
그대로 실어 추론 실패와 구분한다.

Status enum:

```text
queued
running
completed
failed
```

> ⚠ 위 예시의 `stage`와 아래 10단계는 **아직 구현되지 않았다.** BFF가 동기 추론을 감싸므로 세분 단계를 알 수 없고, 실제 계약은 위 4개 상태뿐이다(app-server `docs/API.md`). 앱은 4개 상태 기준으로 만들고, 서버가 주지 않는 진행률을 지어내지 않는다.
>
> 향후 목표 단계: `uploading` · `preprocessing` · `detecting` · `skeleton` · `pose_search` · `rendering` · `cancelled`.

`current/total`은 실제 단계 정보가 있을 때만 제공한다.

---

## 6. 결과

```http
GET /v1/analysis/jobs/{jobId}/result
```

> ⚠ 아래 예시는 **단인 컷을 전제한 초기 형태**다. 실제 BFF 응답은 다인 컷을 지원하는 `candidatesByPerson[]` 구조이고, 앱은 그것을 `people: PersonResult[]`로 옮긴다(`features/pose-viewer/api/pose.contract.ts`). 정본은 app-server `docs/API.md`다.

응답에는 입력 원본의 presigned URL `inputUrl`(900초)과 `inputUrlExpiresInSeconds`가 함께 온다. 원본 보관 기간(90일)이 지났으면 둘 다 `null`이고, 앱은 "보관 기간이 지나 제공되지 않습니다"로 안내한다. 작업 기록에서 지난 작업을 열 때의 원본 미리보기가 이 값을 쓴다(ADR-012).

Response:

```json
{
  "jobId": "job_123",
  "input": {
    "imageUrl": "https://...",
    "width": 1400,
    "height": 2200
  },
  "analysis": {
    "shotType": "full",
    "personCount": 1,
    "overlayImageUrl": "https://..."
  },
  "candidates": [
    {
      "id": "pose_001",
      "rank": 1,
      "title": "상체를 숙이고 팔을 뻗은 자세",
      "tags": ["전신", "측면", "팔 뻗기"],
      "matchLevel": "high",
      "thumbnailUrl": "https://...",
      "previewImages": [
        {
          "view": "front",
          "url": "https://..."
        }
      ],
      "modelUrl": null,
      "bvhAvailable": true
    }
  ]
}
```

`matchLevel`은 후보의 전반적 일치 정도를 나타내는 enum이며, 화면 표시 라벨과 뱃지로 아래처럼 매핑한다. 이 매핑이 정본이며 `docs/04_DESKTOP_UI_GUIDE.md` §10도 이를 따른다.

| matchLevel | 표시 라벨 | 뱃지 |
|---|---|---|
| high | 높은 일치 | 없음 |
| medium | 유사 | 없음 |
| low | 보정 필요 | Warning |

`matchLevel`(일치 정도)과 `tags`(무엇이 유사한지: 예 `동작 유사`, `상체 방향 유사`, `측면`)는 별개다. `tags`는 후보 카드에 함께 노출하는 서술 태그이고, 원시 score는 개발자 모드에서만 노출한다. `matchLevel`은 UI용으로 서버 또는 앱 adapter에서 정의하며 원시 score와 분리한다.

### 6-1. 인물 품질 신호와 폴백

BFF는 인물별로 스켈레톤 품질 신호를 함께 준다. 실제 응답은 `candidatesByPerson[]` 형태이며
정본은 `Standin-app-server/docs/API.md`다.

| 필드 | 값 | 화면 동작 |
|---|---|---|
| `confidence` | `high` \| `low` | `low`면 그 인물의 모든 후보가 `matchLevel=low`로 내려온다 |
| `skeletonState` | `valid` \| `partial` \| `suspect` \| `missing` \| `invalid` | 진단용 |
| `skeletonSource` | `full_image` \| `crop_retry` \| `none` | 진단용 |
| `coverageClass` | `full` \| `reduced` \| `sparse` \| `insufficient` | 진단용 |
| `fallbackMode` | `none` \| `soft` \| `hard` | 아래 |
| `refineAllowed` | boolean | `true`인 선택만 refine을 호출한다 |
| `refinableLimbs` | string[] | 진단용 |

`fallbackMode`가 화면을 가른다.

- `none` — 일반 Top-5.
- `soft` — 저신뢰지만 후보가 있다. Top-5를 계속 보여주되 "스켈레톤 인식이 불확실해 참고용
  후보입니다" 안내를 띄운다. **선택과 베이스 BVH 저장은 가능**하고 refine만 호출하지 않는다.
- `hard` — 이 인물에 자동 후보가 없다. 안내만 보여주고 선택 대상에서 제외한다.
  **다른 인물의 선택·저장은 막지 않는다.**

`soft`와 `hard`를 후보 개수 하나로 뭉치면 두 상태를 구분할 수 없다.

사람 번호는 서버 `personIndex`를 그대로 쓴다(원본 왼쪽→오른쪽). 화면에서 탐지 순서로 다시
번호를 매기지 않는다. raw `distance`와 진단 필드는 일반 사용자에게 노출하지 않는다.

신규 필드가 없는 구 BFF 응답은 `confidence=low`, `refineAllowed=false`,
`coverageClass=insufficient`로 안전하게 해석한다(순차 배포 창).

응답 최상위의 `capabilities.refine`은 서버가 refine을 노출하는지 알려 준다. 이 값이 `false`면
클라이언트는 refine을 호출하지 않는다.

---

## 6-1-1. 인물별 출력 범위 (1단계)

`PersonResult.outputScope`는 BFF 인물의 `outputScope`를 검증해 옮긴다.
`selection: auto | full | half | bust | head`, `detected: full | half | bust | head | null`,
`detectionSource: vlm_person | legacy_shot | unknown`, `resolved: full | half | bust | head`,
`resolutionSource: auto | user | fallback`.

인물 카드와 플로팅 바에서 자동/전신/반신/흉상/두상을 고르면
`PUT /v1/analysis/jobs/{jobId}/people/{personIndex}/output-scope`에 `{ selection }`만 보낸다.
저장이 성공한 값만 Query cache에 반영하고, 실패하면 기존 값과 재시도 안내를 유지한다.
서버 result에 영속화되어 작업 기록에서 복원된다. 후보/refine 변경과 독립적이다.
저장 중에는 확정 버튼을 막는다. 구 BFF는 `capabilities.outputScopeSelection`이 없으므로 UI를 숨긴다.

`outputScopeCropping=false/누락`이면 UI는 설정 저장만 되며 파일이 전신이라고 명시한다. true이면 아래 부분 FBX 계약을 적용한다.
검색/내보내기 파라미터를 바꾸지 않는다. 두상/흉상의 검색 미지원도 그대로 표시한다.
VLM 판별이 없으면 자동(판별 불가 · 전신). 사용자 선택으로 자동 판별값을 덮어쓰지 않는다.

## 6-2. 선택 후보 조정(refine)

```http
POST /v1/analysis/jobs/{jobId}/people/{personIndex}/refine
{ "candidateId": "..." }
```

후보를 확정한 뒤 저장 전에 호출한다(확인 화면, ADR-010). 요청 본문은 `candidateId` 하나뿐이다 —
COCO-17 좌표와 안전정책은 BFF가 보관한 값을 쓴다.

Response:

```json
{
  "jobId": "job_123",
  "personIndex": 0,
  "candidateId": "pose_001::front",
  "refined": true,
  "reasonCode": "ok_partial",
  "adjustedLimbs": ["left_arm"],
  "exportUrl": "/v1/pose-candidates/pose_001/export?jobId=job_123&personIndex=0&candidateId=..."
}
```

**`refined: false`는 오류가 아니다.** 안전 게이트가 조정을 버리고 베이스를 유지한 정상 결과이며
HTTP는 200이다. 이 경우에도 `exportUrl`은 저장 가능한 베이스 BVH를 가리킨다.

호출 실패·timeout도 저장 흐름을 멈추지 않는다. 결과가 없으면 후보의 기존 `bvhUrl`로 저장한다.
`reasonCode`는 코드형 진단값이라 사용자에게 그대로 보여주지 않는다. 현재 화면은 조정 여부를
아예 표시하지 않는다 — 무엇이 달라졌는지 보여줄 수단(3D 미리보기)이 빠진 상태에서 조정
사실만 알리면 근거 없는 안심을 주기 때문이다(`docs/12_EXPORT_AND_SAVE_SPEC.md` §3).

---

## 7. 다시 검색

```http
POST /v1/analysis/jobs/{jobId}/rerun
```

Request:

```json
{
  "excludeCandidateIds": [
    "pose_001",
    "pose_002",
    "pose_003",
    "pose_004",
    "pose_005"
  ]
}
```

Response:

```json
{
  "jobId": "job_456",
  "status": "queued",
  "rerunOfJobId": "job_123"
}
```

---

## 8. BVH 내보내기

선택지 A: 후보별 다운로드 endpoint

```http
GET /v1/pose-candidates/{candidateId}/export?format=bvh
```

Response:
- binary
- `Content-Disposition` 파일명

선택지 B: signed URL

```json
{
  "format": "bvh",
  "downloadUrl": "https://...",
  "expiresAt": "..."
}
```

앱은 다운로드 후 설정된 기본 저장 폴더에 바로 저장한다. 저장할 때마다 경로를 묻지 않는다(ADR-009, `docs/12_EXPORT_AND_SAVE_SPEC.md` §4).

조정 결과가 있으면 이 URL 대신 refine 응답의 `exportUrl`을 쓴다(같은 endpoint에 job/person/
candidate가 붙은 형태다). 조정본과 베이스 중 무엇을 내보낼지는 **BFF가 정한다** — 앱은 어느
쪽인지 몰라도 된다. 추론 서버의 `/refined/{handle}`는 추론 태스크의 로컬 디스크라 태스크가
교체되면 사라지므로 **앱이 직접 호출하거나 보관하지 않는다**.

조정본도 원본과 HIERARCHY·채널 순서가 같으므로 CSP 축 보정과 네이티브 drag 로직은 그대로다.

---

## 8-1. 모델(체형) 선택 — **BFF 구현됨**(`Standin-app-server` `feat/character-selection`)

저장되는 FBX의 체형이다. 앱은 FBX를 만들지 않으므로 이 값은 BFF가 converter에 넘기는
`character_id`가 된다. 계약과 클라이언트 게이트는 `docs/adr/ADR-013-model-selection.md`에 있다.

### 카탈로그

```http
GET /v1/models
X-Installation-Id, X-Device-Token   (다른 분석 라우트와 같다. Bearer 없음)
```

```json
{
  "characters": [
    {
      "characterId": "standin-master-v2",
      "displayName": "기본 남성",
      "gender": "male",
      "availability": "available",
      "source": "builtin",
      "isDefault": true,
      "rigProfile": "mixamo",
      "revision": "v2",
      "previewUrl": null,
      "description": "표준 남성 체형입니다."
    },
    {
      "characterId": "standin-female-v2-lbs",
      "displayName": "기본 여성",
      "gender": "female",
      "availability": "coming_soon",
      "source": "builtin",
      "isDefault": false,
      "rigProfile": "mixamo",
      "revision": "v2",
      "previewUrl": null,
      "description": null
    }
  ],
  "defaultCharacterId": "standin-master-v2"
}
```

1. **가용 여부는 converter가, 표현은 BFF가 정한다.** converter `GET /characters`는 artifact를
   실제로 resolve 해 본 것만 돌려주므로(`list_public(available_only=True)`) 그것이
   `availability`의 유일한 근거다. 반면 converter의 `display_name`은 "Standin Master V2" 같은
   내부 코드명이고 성별·설명은 아예 없다 — 한국어 이름과 성별은 BFF의
   `src/characters/catalog.ts`가 소유한다. 순수 프록시가 아닌 이유다.
2. ⚠ **converter가 지금 못 만드는 캐릭터(artifact URI env 미설정, 예:
   `STANDIN_FEMALE_V2_LBS_URI`)도 목록에서 빼지 않고 `availability: "coming_soon"`으로 준다.**
   앱이 회색 "준비 중" 카드로 보여준다. 빼 버리면 기능 자체가 없는 것처럼 보인다.
   "전체 목록"은 converter가 아니라 BFF의 표에서 온다 — converter는 만들 수 있는 것만 알려
   주므로 "등록됐지만 못 만듦"을 물어볼 방법이 없다. 반대로 converter에만 있고 BFF 표에 없는
   캐릭터도 코드명 그대로 내보낸다 — 등록된 줄도 모르는 것보다 낫다.
3. `gender` ∈ `male | female | unspecified`, `availability` ∈ `available | coming_soon`,
   `source` ∈ `builtin | store | user`(지금은 `builtin`뿐). 모르는 값은 앱이 보수적으로 좁힌다.
4. `defaultCharacterId`는 `CONVERTER_CHARACTER_ID`와 같아야 한다. `isDefault: true`는 정확히
   하나이고 반드시 `available`이어야 한다.
5. `previewUrl`은 optional(지금은 `null`). 주려면 인증이 필요한 상대 경로
   (`/v1/models/{characterId}/preview?view=front`, PNG). 앱은 자기가 커밋한 이미지를 우선
   쓰므로 이 필드는 나중에 붙여도 앱 배포가 필요 없다.
6. `Cache-Control: public, max-age=300`.
7. converter가 불통이면 `503 CONVERTER_UNAVAILABLE`. 앱은 **404 · 501 · 503**을
   "이 배포에는 모델 선택이 없다"로 보고 하드코딩 목록으로 폴백한다(여성은 `coming_soon`).
   그 외 상태는 모델 화면에 오류와 재시도로 나온다.

### 내보내기 파라미터

```http
GET /v1/pose-candidates/{poseId}/export?jobId=&personIndex=&candidateId=&format=fbx&characterId=
```

- `characterId`는 **optional**. 없으면 지금과 같이 `config.converterCharacterId`를 쓴다.
- `format=bvh`에 `characterId`가 오면 **무시한다**(400 아님). BVH는 동작만 담아 체형이 들어갈
  자리가 없고, 앱과 서버는 따로 배포되므로 400은 이득 없이 저장을 깬다. 앱은 보내지 않는다.
- 모르는 id → `400 INVALID_CHARACTER`. 등록됐지만 지금 못 만듦 → `409 CHARACTER_UNAVAILABLE`.
  둘 다 재시도로 풀리지 않는 실패다.
- ⚠ **조용히 기본 캐릭터로 대체하지 않는다.** 고른 체형과 파일이 일치하는 것이 이 기능의
  전부다. 대체하면 사용자는 다른 체형을 받고도 알 수 없다.
- 구현 지점: `src/converter/client.ts`의 `ConvertInput.characterId`는 이미 optional로 열려 있고,
  `src/pose/routes.ts`가 항상 `config.converterCharacterId`만 넘기고 있다. 검증 후 그 값을
  넘기면 된다. 변환 로그의 `characterId: config.converterCharacterId`도 실제 사용값으로 고친다.

### capability 플래그

`GET /v1/analysis/jobs/{jobId}/result`의 `capabilities`에 추가한다.

```json
"capabilities": { "refine": true, "fbxExport": true, "characterSelection": true }
```

`characterSelection: true`는 **export가 `characterId`를 존중하고 동시에 기본이 아닌 캐릭터가
하나 이상 `available`일 때만**이다. 카탈로그와 export는 따로 배포될 수 있으므로 플래그를
따로 둔다 — 카탈로그만 먼저 나가면 앱이 고른 체형과 다른 FBX가 저장된다. 없거나 false가
안전한 상태이고 앱이 false로 좁힌다.

### 확인 결과

- **분석 이벤트 — 해결됨.** `/v1/events/batch`는 이벤트 **이름만** 400으로 거절한다. 속성 키는
  `sanitizeEventProperties`가 allowlist에 없으면 **조용히 버린다** — 배치는 안 깨지지만 지표에서
  사라진다. `input_confirmed`·`export_completed` allowlist에 `characterId`를 넣었고, 같은
  이유로 그동안 조용히 버려지던 `export_completed.format`도 함께 넣었다.
- **여성 artifact — 남은 항목.** `STANDIN_FEMALE_V2_LBS_URI` 자체는 인프라(`Standin-infra`
  `lib/app-stack.ts`)에 이미 `s3://<assets>/characters/standin-female-v2-lbs.fbx`로 설정돼 있다.
  남은 것은 **그 S3 객체가 실제로 올라가 있고 registry의 SHA256과 일치하는가**다 — converter의
  `registry.resolve`가 SHA를 대조하므로 불일치면 목록에 뜨지 않는다. 배포 환경에서
  `GET /v1/models`가 여성을 `available`로 주는지 확인하면 끝난다.

---

## 9. Job 취소

```http
POST /v1/analysis/jobs/{jobId}/cancel
```

서버가 취소를 지원하지 않으면 앱에서 `화면에서 숨기기`와 실제 서버 취소를 구분한다.

---

## 10. 클라이언트 타입

```ts
type AnalysisJobStatus =
  | "queued"
  | "uploading"
  | "preprocessing"
  | "detecting"
  | "skeleton"
  | "pose_search"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

type PoseCandidate = {
  id: string;
  rank: number;
  title: string;
  tags: string[];
  matchLevel: "high" | "medium" | "low";
  thumbnailUrl: string;
  previewImages: Array<{
    view: string;
    url: string;
  }>;
  modelUrl?: string | null;
  bvhAvailable: boolean;
};

/** 저장할 체형(§8-1). `characterId`는 converter의 값 그대로이고 앱은 해석하지 않는다. */
type ModelCharacter = {
  characterId: string;
  displayName: string;
  gender: "male" | "female" | "unspecified";
  availability: "available" | "coming_soon";
  source: "builtin" | "store" | "user";
  isDefault: boolean;
  rigProfile: string | null;
  revision: string | null;
  previewUrl: string | null;
  description: string | null;
};
```

---

## 11. 서버 팀과 확인할 질문

1. 로그인은 access/refresh token인가?
2. refresh token은 회전하는가?
3. 업로드 최대 크기는?
4. 지원 이미지 형식은?
5. Job 상태는 polling, SSE, WebSocket 중 무엇인가?
6. VLM과 검색 단계별 상태를 제공할 수 있는가?
7. 후보는 항상 5개인가?
8. 후보 렌더 이미지를 서버가 제공하는가?
9. BVH는 후보마다 미리 생성되는가?
10. 다시 검색은 전체 재분석인가, 검색만 재실행인가?
11. 작업 기록을 서버에 보관하는가?
12. 입력 이미지와 결과 보관 기간은?


### 관측 상체 검색 (2026-10-02)

- `coverageClass=upper_only`: 골반 기준을 쓸 수 없어, 관측된 어깨·팔만으로 검색한 후보.
  `confidence=low`, `fallbackMode=soft`, `refineAllowed=false`, `refinableLimbs=[]`.
  거리의 단위가 달라 전신 일치도 임계값으로 승격하지 않는다.
- 혼합 구도의 두상 인물은 후보 없이 `candidateShortfallReason=HEAD_SEARCH_UNSUPPORTED`.
  같은 컷의 검색 가능한 인물에는 영향이 없다.
- 출력 범위 수동 선택은 검색을 재실행하지 않는다. 관측 관절과 출력 설정은 별개다.
  부분 FBX 지원은 아래 `outputScopeCropping` 계약을 따른다.
- 구 응답의 누락 필드는 기존 폴백 처리. 실제 부분 검색은 새 분석부터 적용된다.


### 부분 FBX 출력과 검토 미리보기 (2026-10-02)

`outputScopeCropping`은 converter `/healthz`의 건강 상태, 고정 solver 버전,
`framing_version=skin-regions-v1`, full/half/bust/head 지원을 확인한 경우에만 true다.
false/누락이면 기존 전신 출력과 설정 저장 안내를 유지한다.

`GET /v1/pose-candidates/:poseId/framed?jobId=…&personIndex=…&candidateId=…&outputScope=half&format=preview`
는 실제 최종 FBX를 재import해 만든 정면 PNG를 반환한다. 같은 URL에서 `format=fbx`는 그 FBX다.
optional `characterId`는 두 요청에 동일하게 적용한다. 설치 인증, 소유 Job, 확정 후보,
poseId를 매번 검사하며 outputScope는 서버 저장 resolved 값과 일치해야 한다.
다르면 `409 OUTPUT_SCOPE_CHANGED`; 변환 실패 시 전신 파일로 대체하지 않는다.
응답은 `private, no-store`, `X-Standin-Output-Scope`, FBX의 `X-Standin-Artifact-SHA256`를 포함한다.

기존 `/export` 요청과 BVH는 전신 동작을 유지한다. half는 상체+팔+손, bust는
가슴+어깨+목+머리(팔 제외), head는 머리 메시만 남기고 뼈대 계층은 전신으로 보존한다.
후보 카드의 기존 썸네일과 달리 **저장 전 확인 화면**에서 선택 범위를 렌더링한다.
이 기능은 얼굴만 있는 러프의 머리 방향 검색을 추가하지 않는다.
자세한 알고리즘·제한·검증은 `Standin-server/docs/BODY_SCOPE.md`의 3단계를 따른다.


## 후보 카메라 preview (2026-10-07)

`candidate.camera.version=candidate-camera-v1` 응답의 thumbnailUrl은 작업 소유권이 있는
동적 렌더 경로다. 분석 결과 adapter에서 다운로드를 기다리지 않는다. 후보 목록은 먼저
열고 `deferredThumbnailUrl`을 각 카드의 인증된 TanStack Query로 로드한다. 앱/바/확인 화면은
같은 Query key를 공유한다. 준비 중에는 “각도 맞추는 중”, 실패 시 “미리보기 다시 시도”를
표시한다. 준비 전에는 해당 카드 선택을 잠그며, 오류를 예전 방향 이미지로 숨기지 않는다.
기존 작업·Mock·구 서버의 정적 thumbnailUrl은 기존 동작을 유지한다. 카메라 계산은 서버가
담당하며, 앱은 회전 행렬을 재계산하거나 BVH에 적용하지 않는다.

Windows의 타입 검사·컴포넌트/HTTP adapter 테스트로 검증한다. 실제 Tauri/CSP/macOS의
새 빌드 검증과 콜드 변환 지연 측정은 별도이며, 변경된 출력 포맷은 없다.

### Precomputed candidate preview (`posed-mesh-v1`)

Optional `previewModelUrl` with candidate-camera-v1 enables local static GLB rendering.
The authenticated URL accepts the selected characterId. The GLB contains the evaluated
frozen-converter surface in Y-up coordinates, with Hips at the origin; the exact stored
camera.rotation is applied once. Single shared WebGL renderer; 384px PNG snapshot per
card; no animation loop or new pose solver. Raw matrix, source and character are checked.
Missing models, old servers or unavailable WebGL fall back to the existing aligned PNG.
Cancellation does not start fallback work. Final selected/refined/cropped FBX still uses
the converter and its verified preview. BVH behavior is unchanged.


## 체형 선택 UX 확장 (2026-10-08)

새 작업의 기본 설정 `last_used`에서 아직 수동 체형 선택 이력이 없으면 BFF가 현행 남성 기본형을 선택한다.
클라이언트가 가짜 선택을 만들거나 저장 검증을 건너뛰지 않는다. 이전 체형·수치가 있으면 그대로 시작하며,
- 지원 모드는 `last_used`(새 설치 기본)와 `auto`다. `last_used`는 마지막 수동 선택의 체형·수치가 유효하면 그대로 쓰고, 최초 사용·삭제된 체형·무효 수치는 공통 남성 기본형으로 시작한다.
- `auto` 및 인물별 명시적 `auto`는 정상 추천을 사용한다. 추천 없음·실패·disabled·not_applicable·지원 불가이면 같은 남성 기본형을 사용한다. 유효하지만 그림과 다른 추천을 실패로 임의 판단하지 않는다.
- `manual`은 언제나 직접 고른 체형·수치를 유지한다. 자산 소실·해시 변경·변환 실패를 다른 체형으로 숨기지 않는다.
- 남성 기본형은 승인 카탈로그의 현행 `male-base-*` 자산이다. 작업 시작에 자산·버전·해시·리그를 고정한다. 구 snapshot에 이 정보가 없을 때만 현재 카탈로그에서 찾는다. 자산이 없거나 출력 조건을 만족하지 못하면 unavailable로 저장을 막는다. 후보가 없으면 not_applicable이다.

설정 PUT은 `{ mode, expectedRevision, mutationId }`만 보낸다. 카드/수동 조절 API는 유지한다.
과거 저장 경계에서만 legacy를 읽는다. `fixed_default`는 `last_used`로 정규화하고 기존 `auto`/`last_used`, 카드, 마지막 선택을 보존한다. `shapeDefault`의 체형·수치는 `my-default` 개인 카드로 합치고, 현재 응답/다음 설정 쓰기에는 `defaultCharacterId`·`shapeDefault`를 넣지 않는다. 카드 삭제 후 다시 생기지 않는다. `catalog.defaultCharacterId`와 일반 모델 카탈로그 계약은 유지한다.

과거 작업의 `fixed_default`/`user_default_fallback`, 자동 기본형, 미확정 자동 선택은 작업 snapshot을 기준으로 읽기 때 다시 결정한다. 유효한 수동/마지막 선택과 정상 추천은 유지한다. GET은 DB·revision을 바꾸지 않고 다음 명시적 변경은 현재 계약으로 저장한다. 이전 mutation 응답도 반환 경계에서 정규화한다.


새 계약을 지원하는 작업의 기본 설정·인물별 선택·Top-K·최종 확인·저장 기준은 [BODY_SELECTION_UI.md](BODY_SELECTION_UI.md)를 따른다. 구 계약 설명보다 이 확장이 우선한다.


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

## 손 라이브러리·직접 문장 검색 통합 (2026-10-18)

GET /v1/hands/catalog 및 좌우 thumbnail, GET/PUT /v1/analysis/jobs/:id/people/:index/hands를 사용한다.
직접 검색은 GET /v1/semantic-search/capabilities와 POST /v1/semantic-search {query,topK?}이며,
2026-10-19 확장: `topK:null`은 검색 기준을 통과한 전체 후보를 반환한다. 양의 정수는 명시한 개수,
생략은 서버 기본 5이며 BFF가 null을 5로 바꾸거나 20개로 자르면 안 된다. `supportsAllResults:true`를
확인한 앱은 `{query,topK:null}`을 전송한다. 구 BFF에는 제한된 검색으로 조용히 바꾸지 않고 준비 안내를 표시한다.
`maxTopK:20`은 구 앱 호환용이며 새 UI의 표시 상한으로 사용하지 않는다.

서버 페이지네이션은 없다. 앱/플로팅 바 모두 완성된 전체 결과를 한 번 조회하고 각 그룹을 20개씩 연속 추가한다.
이전 카드와 선택은 유지하며 빠른 스크롤이 감지 지점을 건너뛰어도 마지막 후보까지 도달한다.
`near_candidates`는 정식 검색 후보와 다른 참고 그룹에 표시한다. 목록에서는 저장 포스터만 지연 로딩하고,
저장 이미지가 없으면 오류를 표시하며 BVH/메시 렌더로 자동 폴백하지 않는다. 체형 적용/3D 변환은 상세 선택 시에만 실행한다.
검색창은 각 화면 스크롤 상단에 고정한다. 입력 후 300ms 자동 검색, 한글 조합 중 대기, Enter 즉시 검색,
이전 POST/결과 GET 취소와 generation/설치 소유자 확인으로 늦은 응답을 차단한다. 전체 결과를 미리 수신해
새 job으로 이동해도 검색 input과 focus를 유지한다. 새 결과는 첫 행으로 스크롤을 돌리며 기록 이동 시에도
검색 문장을 동기화하고 이전 검색을 취소한다. 러프 `/analyze`의 요청·Top-5·페이지 동작은 변경하지 않는다.

구형 고정 성인 6종과 구형 청소년 `body-teen-male`, `body-teen-female`은 카탈로그·체형 옵션에서 제외한다.
아동 `body-child`는 유지한다. 이전 서버가 청소년 선택을 `ready`로 반환해도 앱은 `unavailable`로 처리하고
사용자에게 다른 체형 선택을 요청한다.

자연어 작업의 체형 상태가 `intent=inherit`, `resolutionStatus=needs_selection`이고 선택한 체형·수치가 없으면,
체형을 저장하기 전까지 기본 남성 참고 모델을 표시한다. 이때 `/model`에 `bodyRevision`을 보내지 않으며
기본 참고임을 안내한다. 사용자 체형이 준비되면 해당 revision으로 전환한다. 수동 선택의 오류·사용 불가 상태나
체형 조회 실패는 기본 모델로 대체하지 않는다.

신규 후보는 조회 전용이다. BFF semantic-pose-presentation-v1은 정식/근접 후보를 분리하고
명시적 정면 참고 카메라와 인증된 BVH preview URL을 제공한다. 구형 #87 내보내기 계약으로 해석하지 않는다.
손 reference PNG는 기존 preview URL + /hands?revision=N이다. PNG-only/손 revision/library 헤더를 확인하고
권한을 승격하지 않는다. 자세한 현재 흐름은 HANDS_SEMANTIC_INTEGRATION.md를 따른다.

### 자연어 검색 고정 남성 모델 조회

`GET {preview_bvh_url}/model` — semantic-pose-presentation-v1의 full 검색/근접 후보에 한정한다.
설치 인증을 유지하며 다른 설치의 작업은 404다. query는 허용하지 않는다(체형/format 지정 불가).
200은 model/gltf-binary이며 X-Standin-Preview-Only=true, Character-Id, Model-Version,
Source-BVH-SHA256, Character-SHA256, Model-Revision, Artifact-SHA256 헤더(X-Standin- prefix)를 검증한다.
기본 남성 standin-master-v2의 posed-mesh-v1 또는 framed-mesh-v1만 표시한다.
기존 export/refine API에 대한 허용을 의미하지 않는다. bodyPreviews/characterSelection capability를 열지 않는다.

### 자연어 검색 체형 선택 확장

`capabilities.semanticBodySelection === true`일 때 기존 인물별 body-options/body-selection API를 사용한다.
선택은 previewOnly이며 refine/export/release 허용으로 해석하지 않는다. bodyPreviews는 legacy 이미지 경로용으로 계속 false다.
`{preview_bvh_url}/model?bodyRevision={selectionRevision}`은 저장된 resolvedBody/shape만 사용한다.
X-Standin-Body-Revision/Body-Shape-SHA256(none 또는 hash), Character-Id/Character-SHA256,
Model-Revision/Artifact-SHA256와 GLB 내부 source/character/revision/shape_sha256를 모두 검증한다.
체형 저장·다시 읽기·새 모델 준비 중에는 이전 체형을 숨기고, revision을 포함한 query key로 늦은 응답을 격리한다.
capability 없는 구형 BFF는 기존 고정 남성 표시를 유지한다. 모델 재시도 시 체형 선택도 새로 읽는다.

정적 모델 GLB는 한 mesh와 내부 buffer 하나, 최대 8개의 정적 primitive를 허용한다.
큰 아동 모델은 원본 정점·split normal·삼각형을 유지한 UInt16 인덱스 파트로 전달하며,
8MiB 및 accessor별 50만 항목 제한은 유지한다. 외부 자산·스킨·애니메이션·확장·morph target은 계속 거절한다.
이 앱을 먼저 배포한 뒤 새 Converter를 배포해야 기존 앱의 단일 primitive 검사와 충돌하지 않는다.

## 체형 Top-K 출력 범위 연결 (2026-10-18)

body-previews.v1.outputScope는 full/half/bust/head를 받는다. 누락·미지원 값은 계약 오류다.
사용자 선택을 반영한 인물 범위와 manifest 범위가 일치해야 이미지 묶음을 표시한다.
후보 카드와 플로팅 바가 공유하는 useBodies 이미지 키에 scope를 포함하고, 범위/체형/수치 변경 중 이전 이미지 묶음을 표시하지 않는다.
full GLB는 posed-mesh-v1이며 후보 rotation을 한 번 적용한다. 부분 GLB는 scope와 rotation이 이미 적용된 framed-mesh-v1이다.
GLB 내장 scope·원본 BVH·체형 hash·exporter revision·camera rotation을 검증하고 rotation을 중복 적용하지 않는다.
WebGL/모델 가용성 실패는 같은 manifest의 PNG를 사용한다. 권한·무결성·stale 4xx 또는 취소는 PNG 생성으로 이어지지 않는다.
수치 조절 체형은 기존 검증된 PNG 경로를 유지한다. 손 적용 참고 미리보기도 범위 변경 시 이전 이미지를 숨긴다.
shoulder_head를 새 사용자 범위로 추가하거나 bust와 새로 합치는 변경은 포함하지 않는다. 원본 BVH와 최종 Export 정책은 유지한다.
새 앱과 부분 manifest를 반환하는 BFF를 함께 릴리스해야 한다. 자동 테스트는 실제 설치 앱·실제 체형 외형의 시각 E2E 검증과 구분한다.

#### #99 추가분 통합
#100의 범위별 framed GLB 검증과 회전 중복 방지, PNG fallback, Mock 처리를 유지한다. shoulder_head를 어깨~머리 선택으로 추가하고 vlm_description/observed_legs 및 선택적 meshScope를 수용한다. 자동 bust 판정은 팔 보존용 half 메시를 표시하며 수동 bust는 흉상 크롭이다. 카드와 바, presentation body·손 PNG가 같은 최종 범위를 사용한다.

손 변경 시 body 이미지 요청을 취소/무효화하고 변경 중 이전 그룹을 숨긴다. manifest.hands가 있으면 hand revision/library hash를 검증한다. X-Standin-Output-Scope가 있는 새 BFF 응답은 이를 검증하며, 구 BFF는 기존 renderKey·digest 바인딩으로 호환한다. 청소년 제거와 multipart 지원은 독립 PR #98에서 유지한다.

### 손 단계와 최종 출력 메시 범위

손 조회·변경·참고 손 미리보기·최종 손 영수증은 인물별 최종 메시 범위가 `full` 또는
`half`인 경우에만 사용한다. `head`, `shoulder_head`, 수동 `bust`는 손 표면이 없으므로
손 UI와 GET/PUT·썸네일·미리보기 요청을 생략하고 손 준비 완료를 기다리지 않는다.
사용자의 `selection`이 우선이며 자동은 `meshScope`를 사용한다. 자동 `bust`는 기존
계약대로 `half`가 되어 팔·손을 유지하므로 수동 `bust`와 구분한다.

손이 없는 최종 범위의 body manifest는 `hands: null`이고, PNG/FBX에는
`handSelectionRevision` 쿼리와 `X-Standin-Hand-*` 영수증이 없다. 체형·원본·출력 범위·최종
검수 영수증은 계속 검증한다. 손 선택은 삭제하지 않고, `full`/`half`로 돌아올 때 서버의
현재 선택과 라이브러리를 다시 확인한다. 혼합 장면에서는 손이 있는 인물만 손 단계에
참여하며 후보의 수동 확정·refine·내보내기 권한은 기존 정책을 따른다.

## 생성 포즈 수동 사용 확장 (2026-10-20, 02~08)

`source=generation`, `poseId=null`의 생성 후보는 별도의 `manualExportAllowed`와 원본 해시가
확인된 경우 직접 선택→기존 확정→체형·손·범위를 적용한 최종 확인→동일 FBX 개별 저장으로
연결한다. 원래 presentation 그룹과 검색/생성 상태, 자동 금지 정책을 유지한다.
기존 조회 전용 항목의 자동 권한을 변경하는 계약이 아니다.
[원본 식별·무효화·복원·검증 범위](GENERATED_MANUAL_EXPORT.md).

## 동적 라이브러리 refine 연결 (2026-10-21)

일반 이미지 분석에서도 `posePresentation`이 있다는 이유만으로 refine을 일괄 금지하지 않는다.
인물의 refineAllowed=true와 선택 후보의 명시적 refineAllowed=true가 모두 있어야 한다.
선택 후보는 source=library, presentationKind=library_match, manualExportAllowed/lookupAllowed=true,
notExactMatch=false 및 원본 해시와 같은 candidate-camera-v2를 가져야 한다.

조건을 만족하면 검색 confidence=low/fallbackMode=soft여도 기존 저장 전 확인 흐름에서
refine을 호출한다. 자동 release 권한은 올리지 않고, 보정 결과가 기존 최종 미리보기와 저장으로
이어진다. 참고·생성·문장 직접 입력 검색과 구 BFF 응답은 계속 보정하지 않는다. 기능 스위치는
서버 capabilities.refine을 따르며, 시간 초과/실패/안전 게이트 거절 시 원본 후보를 유지한다.
서버와 BFF 배포 후 이 클라이언트 버전을 설치하고 새 분석으로 확인해야 한다.

## 필수 업데이트 (2026-10-27)

최소 지원 버전은 **0.2.0 정식**이다. 공통 HTTP client가 실행 중인 빌드 버전을
`X-App-Version`에 싣는다. 앱 시작 시 `GET /v1/client-policy`로 서버 정책을 확인한다.
HTTP 426 `UPDATE_REQUIRED`를 받으면 앱 화면 전체를 업데이트 화면으로 교체한다.
이 상태는 실행 중 유지되며 `나중에`·화면 이동·바 모드로 해제할 수 없다.
0.2.0 미만 Tauri 빌드는 서버 연결 전에도 차단한다. Mock 브라우저 개발은 유지한다.
업데이트 확인·다운로드·설치·재시작은 기존 서명 검증 updater를 사용하며 자동 업데이트가
없는 빌드는 설정된 Standin 홈페이지에서 직접 설치할 수 있다. 설치 후 재시작해야 해제된다.
분석·저장은 서버에서도 검사하므로 기존 배포 앱이 새 UI를 갖고 있지 않아도 사용할 수 없다.
릴리스 순서: 0.2.0 이상 설치 파일과 업데이트 피드를 게시한 다음 최소 버전 정책 BFF 배포.

### Replay retry control (2026-10-31)

Failed `DELETE /v1/replays` is retained as installation-owned IDB control work, separate from
the bounded payload queue, and retried at startup/online/timer while collection remains
stopped. Device tokens are attached at send time and never persisted in replay controls.
Pending deletion is never sent with another installation's credentials. Exact asset bytes
may retain multiple immutable semantic/version/expiry bindings during offline retry.
Server acknowledgement clears pending deletion, not the local withdrawn state.
