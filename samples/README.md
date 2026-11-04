# 문장 검색 점진 로딩 샘플

실제 `PoseViewerPage`와 `BarCandidatesPage`를 사용하는 로컬 샘플이다. 운영/외부 API로 요청하지 않는다.
샘플 순위는 1,000개 fixture이며 표시 이미지는 선택적으로 제공하는 로컬 저장 포스터다.

```sh
npm ci
VITE_USE_MOCK_API=false VITE_USE_MOCK_POSE_API=false npm run dev
```

- `/samples/progressive.html`: 전체화면
- `/samples/progressive.html?bar`: 플로팅 바 (850×640 viewport 권장)
- `/samples/progressive.html?legacy`: 전체 JSON 응답과의 호환 동작 (과거 구현 비교는 develop 소스를 별도로 실행해야 한다)

로컬 검수용 PNG 10개를 `samples/local/poster-0.png` ~ `poster-9.png`에 둔다. 자산은 Git에 포함하지 않는다.
PNG가 없으면 포스터 오류 상태를 확인할 수 있다. fixture 인증 헤더는 이 샘플의 fetch adapter 안에서만 생성한다.
브라우저 console의 `sampleStats`에서 페이지/포스터 요청과 최대 동시 요청 수를 확인할 수 있다.
`sampleStats.failNext=true`로 다음 페이지 오류, `sampleStats.delay=600`으로 지연·취소를 재현할 수 있다.
선택/다음 묶음/재시도/원래 위치 복귀는 제품 컴포넌트 자체의 동작이다. 저장 버튼 뒤 실제 내보내기는 샘플 범위가 아니다.
