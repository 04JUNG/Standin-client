# FastAPI 연동 계약 초안

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

`inputAvailable`은 입력 원본이 아직 서버에 있는지다. **원본은 90일, 작업 기록은 1년 보관**이므로 그 사이 구간의 작업은 목록에 나오지만 원본 미리보기는 제공되지 않는다.

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
