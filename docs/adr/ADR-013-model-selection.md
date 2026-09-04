# ADR-013: 저장할 모델(체형)을 고르는 방식

- 상태: 제안됨
- 날짜: 2026-09-04
- 관련 문서: docs/08_API_CONTRACT.md §8-1, docs/09_STATE_AND_DATA_MODEL.md,
  docs/12_EXPORT_AND_SAVE_SPEC.md, docs/adr/ADR-005-3d-viewer-timing.md,
  docs/adr/ADR-009-pose-file-delivery.md, docs/adr/ADR-012-job-history-reentry.md

## 배경

저장되는 FBX는 늘 남성 체형이다. 앱에 고를 방법이 없어서다.

앱은 FBX를 만들지 않는다. BFF가 converter의 `POST /convert`에 `character_id`를 실어
받아온 바이트를 그대로 내려준다. 그 값은 서버 환경변수로 고정돼 있다 —
app-server `src/config.ts`:

> 변환에 쓸 캐릭터. 현재 registry에는 승인된 것이 하나뿐이라 클라이언트에 고르게 하지
> 않는다. 늘어나면 converter `GET /characters`를 프록시해 노출한다.

여성 체형 자체는 있다. converter registry에 `standin-master-v2`(남)와
`standin-female-v2-lbs`(여)가 등록돼 있고, converter는 artifact가 준비된 것만 노출한다.

되돌리기 어려운 결정이 둘이다: **이 값을 어느 요청에 싣는가**, 그리고 **언제 확정하는가**.

## 선택지

### 어느 요청에 싣는가

- **A. 분석 Job 생성(`POST /v1/analysis/jobs`)에 싣는다.** "이 작업은 여성으로 분석했다"가
  서버에 남는다. 대신 체형을 바꾸려면 재분석이 필요하고, 그건 쿼터를 깎는다.
- **B. 내보내기(`export`)에 싣는다.** `format`이 붙는 그 자리다.

### 언제 확정하는가

- **C. 전역 설정값을 저장 시점에 읽는다.** 스토어 하나로 끝난다.
- **D. 전역 설정값 + 흐름 시작 시 job에 고정(pin).** 필드 하나와 액션 하나가 는다.
- **E. `uploadStore.draft`에 붙인다.** 입력과 함께 다닌다.

## 결정

**B와 D를 채택한다.**

### B — 체형은 export 파라미터다

분석 결과(BVH 스켈레톤)도 후보도 refine 결과도 체형과 무관하다. 체형은 BFF가 최종 BVH를
FBX로 바꿀 때만 쓰인다. A를 고르면 체형을 바꿀 때마다 재분석이 필요해지고, 같은 컷을 남녀
두 벌로 뽑는 흔한 작업이 쿼터 두 번이 된다.

따라오는 성질 하나: **지난 작업을 다른 체형으로 다시 저장하는 것이 정상 동작이다.**
"이 job이 분석된 체형" 같은 개념이 없으므로 작업 기록 재진입(ADR-012)이 어렵지 않다.

### D — 설정값은 전역, 확정은 job별

C는 구체적으로 이렇게 깨진다. 여성으로 분석을 시작하고, 3분짜리 분석이 도는 동안 모델
화면에서 남성을 눌러 **보기만** 한다. 저장은 화면에 들어오면 자동으로 시작하므로(ADR-009)
붙잡을 저장 버튼이 없고, 그 컷은 조용히 남성으로 저장된다. 저장 화면에 "이 작업은 여성으로
저장합니다"라고 쓸 수도 없다 — 전역 스토어는 "지금 설정값"만 답하지 "이 작업이 약속한 값"은
모른다.

E는 셋이 걸린다. `newScene()`이 `clearDraft()`를 부르고, 작업 기록 재진입에는 draft가 아예
없으며(`useAnalysisResult`의 `restoreOnly`), export가 주소로 쓰는 단위는 draft가 아니라
`jobId/personIndex/candidateId`다.

작업 기록에서 지난 작업을 열면(ADR-012) 고정값이 없다. 그때는 `resolveCharacter`가
`pinned ?? preferred ?? 기본값` 순으로 내려가 **오늘 설정값**을 쓴다. 체형이 export
파라미터이므로 지난 작업을 오늘 체형으로 다시 저장하는 것이 맞는 동작이고,
`format`이 이미 그렇게 동작한다. 저장 화면이 어떤 체형을 썼는지 말하므로 조용하지 않다.

고정값을 `usePoseSelectionStore`에 둔다. 수명이 정확히 맞기 때문이다 — 라우트 `jobId`로 키가
잡히고, `setJobId`가 새 job에서 비우고, 앱과 바가 공유하고, persist하지 않고,
`useSaveFlow`가 이미 `getState()`로 이 스토어를 읽는다. 설정값은 `modelStore`에 두고
persist한다(`useExportStore.format`과 같은 역할).

### 게이트는 둘, 둘 다 기본 닫힘

`resolveCharacter`가 유일한 판정 자리다.

| 조건 | 결과 |
|---|---|
| `format === "bvh"` | 파라미터 없음 — BVH는 동작만 담아 체형이 들어갈 자리가 없다 |
| `capabilities.characterSelection`이 아님 | 파라미터 없음 — 이 배포의 export가 아직 값을 존중하지 않는다 |
| `availability !== "available"` | 파라미터 없음 — 지금 만들 수 없는 체형이다 |

파라미터를 붙이지 않으면 BFF가 자기 기본 캐릭터를 쓴다 = 이 기능이 없던 때와 바이트까지
같은 결과다. 카탈로그와 export는 따로 배포될 수 있으므로 플래그를 하나로 합치지 않았다 —
카탈로그만 먼저 나가면 앱이 고른 체형과 다른 FBX가 나간다.

그리고 어느 경우든 **저장 화면이 어떤 체형으로 저장했는지, 아니면 왜 못 했는지 말한다.**
조용한 대체는 구현하지 않은 기능을 작동하는 것처럼 보이게 하는 일이다(CLAUDE.md §10).

### 미리보기는 커밋된 정지 이미지

모델 카드의 그림은 작성 시점에 한 번 렌더해 커밋한 PNG다. 런타임에 3D를 그리지 않는다 —
클라이언트 three.js 미리보기는 2026-08-05 `a31aeda`에서 걷어냈다(실제 자세가 아니라 T자
뼈대가 나왔고 번들이 895 kB → 373 kB로 줄었다, ADR-005). 렌더 도구는 저장소 의존성 그래프에
넣지 않는다(`docs/model-preview-assets.md`). 이미지는 별도 에셋으로 나가고 JS 번들은 그대로다.

## 결과

- 서버 팀이 `docs/08_API_CONTRACT.md` §8-1을 구현해야 여성이 실제로 나온다. 그때까지 앱은
  여성 카드를 "준비 중"으로 잠근다.
- converter 배포에 `STANDIN_FEMALE_V2_LBS_URI`가 설정돼 있어야 한다.
- `ModelCharacter.source`(`builtin | store | user`)와 섹션 구조가 에셋 스토어·모델 불러오기·
  체형 수정이 들어올 자리다. 흐름 코드가 `characterId`를 해석하지 않는 한 그 확장은 데이터
  추가로 끝난다.
- 다인 컷은 저장 배치 하나에 체형 하나다. 인물별로 다르게 하려면 이 결정을 다시 본다.
- 재검토 조건: 체형이 포즈 검색 결과에 영향을 주게 되면(예: 체형별 리트리벌) B가 무너진다.
