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

Status enum:

```text
queued
uploading
preprocessing
detecting
skeleton
pose_search
rendering
completed
failed
cancelled
```

`current/total`은 실제 단계 정보가 있을 때만 제공한다.

---

## 6. 결과

```http
GET /v1/analysis/jobs/{jobId}/result
```

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
`reasonCode`는 사용자에게 그대로 보여주지 않고 문구로 번역한다(적용 "러프에 맞춰 조정됨",
스킵 "안전하게 원본 포즈를 유지했습니다").

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
