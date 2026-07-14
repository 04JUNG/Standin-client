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

앱은 다운로드 후 저장 대화상자를 통해 사용자가 지정한 경로에 저장한다.

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
