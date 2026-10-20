# 서명된 설치 파일 업데이트 검증

[2026-10-20 검증 결과](../../docs/qa/2026-10-20-signed-updater.md): 세 플랫폼 21/21 통과.

`.github/workflows/update-e2e.yml`은 Windows x64, macOS Apple Silicon, macOS Intel에서
각각 A(`0.1.1-beta.9`)와 B(`0.1.1-beta.10`)를 빌드하고 설치한다. GitHub Release를
만들거나 production의 `latest.json`을 변경하지 않는다.

## 격리

- 앱 이름: `Standin Updater QA`
- 앱 identifier / 키체인 서비스: `app.standin.desktop.update-e2e`
- 딥링크: `standin-update-e2e`
- 업데이트 피드: 각 러너의 `https://127.0.0.1:17443`
- 업데이터 서명: 러너에서 생성한 일회용 minisign 키. production 업데이터 개인키는 사용하지 않는다.
- TLS: 일회용 CA와 서버 인증서. 테스트 바이너리의 HTTP 클라이언트만 이 CA를 신뢰한다.
  인증서 검증을 끄거나 OS 인증서 저장소를 변경하지 않는다.
- OS 코드서명: 기존 SSL.com / Apple Developer ID 자격증명과 Apple 공증을 사용한다.
  개인키와 인증서 자격증명, 테스트 서버 개인키는 결과 artifact에 포함하지 않는다.

테스트 진입점은 `scripts/update-e2e/main.tsx`이며 실제 업데이트 store, native command,
변경 내역 Modal을 사용한다. 설치 등록·투어 상태만 준비하고 BFF 호출은 하지 않는다.
일반 앱의 `src/main.tsx`는 이 진입점을 import하지 않는다. 네이티브 테스트 명령과
TLS CA는 명시적인 Cargo `update-e2e` feature 빌드에만 포함된다.

## 실행

`codex/automatic-updates-e2e` 브랜치의 push 또는 워크플로 수동 실행으로 시작한다.
각 러너가 새 환경에서 실행되므로 테스트 앱의 데이터와 서명 키가 이전 실행과 섞이지 않는다.

1. A와 B를 OS 코드서명하고 updater artifact를 minisign 서명한다. macOS 앱은 공증한다.
   `scripts/tauri-release.mjs`가 최종 앱의 공증 티켓을 부착하고 아카이브를 다시 만든다.
   압축을 풀어 서명·티켓을 검사한 후 최종 아카이브에 updater 서명을 생성한다.
   DMG도 같은 앱으로 재구성·재서명한 뒤 다시 마운트해 내부 앱의 티켓을 검사한다.
2. Windows는 A의 NSIS 설치 파일을 실행한다. macOS는 A의 DMG를 마운트하고 앱을 복사한다.
3. 아래 시나리오를 설치된 바이너리에서 순서대로 수행한다.
4. B 설치 후 네이티브가 보고한 버전, 실행 파일 해시 변경, OS 서명을 확인한다.
   Windows는 A/B 설치 파일과 설치된 앱·언인스톨러의 서명 및 타임스탬프를 검사한다.
   macOS는 A/B 앱의 `codesign`, `stapler validate`, `spctl` 검사를 모두 통과해야 한다.

| 시나리오 | 확인하는 동작 |
| --- | --- |
| reject-signature | 형식은 유효하지만 변조된 minisign 서명을 거부하고 설치 캐시를 만들지 않음 |
| download | B를 자동 다운로드하고 A는 계속 실행; 캡처·저장·미저장 선택 상태에서 수동 설치 차단 |
| offline | HTTPS 서버를 끈 상태로 다시 실행해 A를 사용하고 캐시 유지 |
| tamper | 다운로드 파일의 바이트 변조를 설치 전에 거부; 실패 시도 기록 보존 |
| recover | 같은 버전을 반복 설치하지 않고 손상된 캐시를 다시 다운로드 |
| upgrade | A를 다시 실행하면 자동 설치·재시작하여 실제 B가 실행되고 변경 내역 팝업 표시 |
| no-repeat | 팝업 확인 후 WebView의 확인 기록을 지우고 즉시 종료해도 다음 실행에는 반복하지 않으며 설정에서 변경 내역을 다시 열 수 있음 |

## 증거와 범위

`updater-e2e-evidence-<platform>` artifact에 `results.json`, 네이티브 실행 이벤트,
HTTPS 요청 기록, OS 서명 결과를 보관한다. `allPassed`는 7개 시나리오가 모두 성공한
경우에만 `true`다. 마지막 캐시 정리와 프로세스 종료 등 사후 검사 실패도 성공으로 기록하지 않는다.
설치 파일은 별도 `updater-e2e-installers-<platform>` artifact다.
이 설치 파일은 QA 진입점과 임시 피드를 사용하므로 사용자 배포용으로 사용하지 않는다.
macOS 앱이 초기 이벤트 없이 시간 초과되면 네이티브 스레드 표본도 수집한다.

macOS는 각각 해당 CPU의 서명된 바이너리를 실제 실행한다. production의 universal
패키징은 별도 release workflow의 `lipo`, 서명·공증 검사 대상이다. 이 검증은 일반
사용자 PC의 SmartScreen 평판, UAC 거부, DMG를 응용 프로그램으로 옮기는 수동 조작,
모든 보안 제품 조합을 자동화했다는 의미는 아니다.
