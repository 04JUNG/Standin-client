# 체형 선택 UI 검증

2026-10-08. 실제 React 앱·바 컴포넌트 + 격리된 API fixture. **그림과 FBX bytes는 실제 모델이 아니다.** 차렷 도식에 QA 표시를 넣었다. 실제 외형 검수 증거로 쓰지 않는다.

- 후보/카드: 9종 테스트 데이터. 제품의 체형 수는 하드코딩하지 않음.
- 720×460 바, 1280×800 앱. 선택 즉시 반영, 빠른 2→3 변경, 확정 후 접기, 포커스, 다인 분리, 앱 전환, 최종 다운로드 검증.
- 기본 체형 등록 후 auto 유지, 명시적 fixed_default 변경, 기존 Job 불변.
- 확인 캐시를 지운 뒤 직접 저장 진입: 파일 다운로드 차단.
- `body-ui-result.json`: 요청/검증 결과. 브라우저 pageerror 0.

## 자동 검증

- 클라이언트: **419 tests / 57 files 통과**, typecheck / lint / build 통과.
- Node 26에서는 `NODE_OPTIONS=--no-experimental-webstorage npm test -- --reporter=dot` 사용.
- BFF: **305 tests, skip 0**, 임시 실제 PostgreSQL 포함. typecheck/build 통과.
- macOS 호스트 `cargo check` 통과. Windows와 Tauri GUI 실행·CSP 실제 드롭은 미검증.
- 빌드 결과 main 538.12 kB, 지연 로딩 Three renderer 620.01 kB. 기존 chunk 경고는 남음.

## 브라우저 검증 재현

1. 이 워크트리에서 `npm ci` 후 `npm run dev -- --host 127.0.0.1 --port 1428 --strictPort`.
2. Playwright가 설치된 별도 QA 환경에서 `NODE_PATH=<playwright가 있는 node_modules> node artifacts/body-selection-ui/body-ui.cjs`. 기본 브라우저는 macOS Chrome이며 `CHROME_BIN`으로 변경 가능.
3. 검증 출력은 `/tmp/body-ux-check/`에 저장. 모든 외부 API 요청은 fixture로 가로챈다. 실제 서버나 로컬 저장 폴더에 쓰지 않는다.
4. 개발 모듈을 주입하므로 소스를 수정한 후에는 Vite를 재시작한다. HMR timestamp가 다른 모듈 인스턴스를 만들 수 있다.

운영 활성화, 실제 9종 FBX/차렷 PNG 승인, 다중 모니터 실기 검수는 배포 전 별도 게이트다.
