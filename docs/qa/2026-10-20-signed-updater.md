# 서명된 설치 파일 A→B 업데이트 검증

상태: Windows x64, macOS Apple Silicon·Intel의 서명된 QA 앱에서 21/21 시나리오 통과.
production 배포는 수행하지 않았다.

## 검증 대상

Windows x64, macOS Apple Silicon, macOS Intel의 GitHub 호스팅 러너에서
OS 코드서명한 A(`0.1.1-beta.9`)를 실제 설치하고 B(`0.1.1-beta.10`)로 업데이트한다.
macOS 앱은 Apple 공증도 수행한다. 앱이 보고한 네이티브 버전, 실행 파일 해시,
업데이트 후 OS 서명, WebView 안의 변경 내역 팝업과 확인 기록을 검사한다.

테스트 앱 이름은 `Standin Updater QA`, identifier와 키체인 서비스는
`app.standin.desktop.update-e2e`다. production 계정·캐시·업데이트 피드를
사용하지 않는다. 코드서명에는 기존 CI 자격증명을 사용하고, updater 서명과 HTTPS는
러너에서 만든 일회용 키·인증서를 사용한다. TLS 검증을 비활성화하지 않는다.

일반 앱에서 사용하는 업데이트 store, Rust 명령, 변경 내역 컴포넌트를 테스트
진입점에 연결했다. 설치 등록·투어 상태는 준비된 값이며 BFF 호출은 하지 않는다.
테스트 전용 IPC와 CA는 Cargo `update-e2e` feature에만 포함된다.

## 시나리오

1. 변조된 updater 서명 거부: 캐시와 설치가 생성되지 않는다.
2. 자동 다운로드: A를 계속 실행하며 캡처·저장·미저장 선택 중 수동 설치를 차단한다.
3. 오프라인 재실행: HTTPS 서버를 정지해도 A가 실행되고 다운로드 캐시가 유지된다.
4. 캐시 변조: 다운로드한 파일의 바이트를 바꾸면 설치 직전 검증에서 거부한다.
5. 복구: 같은 실패를 자동으로 반복하지 않고 정상 패키지를 다시 다운로드한다.
6. 실제 업데이트: 다음 실행에서 설치·재시작하여 B가 실행되고 변경 내역 팝업이 표시된다.
7. 확인 기록: 팝업 확인 후 브라우저의 확인 기록을 지우고 즉시 종료해도 재실행 시
   반복되지 않으며 설정의 변경 내역을 다시 열 수 있다. 네이티브 기록을 사용한다.

## 발견하여 수정한 문제

- macOS 설치 패키지의 공증 티켓 누락: Intel B는 코드서명이 유효하고 Gatekeeper도
  승인했지만 `stapler validate`가 실패했다. 최종 `.app`에 티켓을 부착하고 아카이브를
  다시 만든 뒤, 압축을 풀어 코드서명과 티켓을 검증한다. 마지막으로 updater 서명을
  다시 생성한다. 초기 설치 DMG에도 누락이 확인되어 기존 볼륨 레이아웃을 유지하면서
  검증된 앱으로 재구성·재서명하고, 완성된 DMG를 마운트해 내부 앱을 검사한다.
  임시 서명 키체인은 사용 후 삭제하고 검색 목록도 복원한다.
  release workflow도 동일한 `scripts/tauri-release.mjs`를 사용한다.
- Windows NSIS 언인스톨러 서명: SSL.com이 NSIS 임시 파일의 `.tmp` 확장자를 거부했다.
  전용 임시 폴더의 `.exe` 복사본에 서명하고 유효성·타임스탬프 확인 후 원본에 반영한다.
  E2E에서 설치된 A/B 앱과 언인스톨러까지 서명을 검사한다.
- Windows 테스트 드라이버: PowerShell 7의 모듈 경로를 상속한 PowerShell 5에서
  서명 검사 모듈 로드가 실패했다. 드라이버가 호스트의 `pwsh`를 사용하도록 수정했다.
- Apple 티켓 서버의 일시적 연결 오류: 오류 68만 간격을 늘리며 최대 네 번 재시도한다.
  티켓 누락·불일치 오류를 무시하거나 검증 성공으로 처리하지 않는다.
- macOS 팝업 확인 기록 유실: 확인 직후 종료한 다음 실행에서 팝업이 반복됐다.
  WebView localStorage에만 의존하던 기록을 네이티브 파일의 sync→rename 저장으로
  변경하고 저장 완료 후에만 팝업을 닫는다. 저장 실패 시 재시도 안내를 표시한다.
  E2E는 WebView의 확인 기록을 명시적으로 지워도 반복되지 않는지 검사한다.

## 증거

최종 검증 커밋은 `0b1756d3bbd97b353c2a56a8d1e91efa7e59afcc`이며
[CI 실행 39430129079](https://github.com/04JUNG/Standin-client/actions/runs/39430129079)에서 확인한다.

| 환경 | 결과 |
| --- | --- |
| Windows Server 2025, x64 | 7/7 통과; A/B 설치 파일·앱·언인스톨러 서명 6건 모두 Valid + timestamp |
| macOS 15.7.9, Intel | 7/7 통과; A/B 앱의 서명·공증 티켓·Gatekeeper 검사 성공 |
| macOS 15.7.9, Apple Silicon | 7/7 통과; A/B 앱의 서명·공증 티켓·Gatekeeper 검사 성공 |

세 플랫폼의 네이티브 버전, 팝업·설정 이력 이벤트, 작업 보호 이벤트와 서명 결과를
내려받아 대조했다. [플랫폼별 결과 JSON](2026-10-20-signed-updater-results.json)에
실행 커밋과 21개 시나리오 결과를 보관한다.

`updater-e2e-evidence-<platform>`에는 `results.json`, `events.jsonl`,
`os-signatures.txt`, HTTPS 요청 기록을 보관한다. 모든 시나리오와 사후 검사가
끝난 경우에만 `allPassed: true`다. 증거 보관 기간은 14일, QA 설치 파일은 7일이다.

이전 [실행 39422374014](https://github.com/04JUNG/Standin-client/actions/runs/39422374014)의
Windows·Intel은 7개 모두 통과했다. 첫 시도의 Apple Silicon에서는 5개 시나리오 통과 후 `upgrade`의 앱 실행이
240초 동안 초기 이벤트를 기록하지 못했다. 해당 실행에서 업데이트 설치가 시작됐다는
증거는 없으며, 원인은 특정되지 않았다. 같은 커밋의 두 번째 시도에서는 설치·팝업까지
성공했고 확인 후 팝업 반복 문제가 드러나 위와 같이 수정했다. 최초 실패 기록도 보관한다.
초기 이벤트 없이 멈췄던 현상은 최종 실행에서 재현되지 않았으며, 원인 해결을 단정하지 않는다.

추가 로컬 검증: 업데이트 관련 테스트 50개, 네이티브 확인 기록의 디스크 재읽기·
다운그레이드 보존·손상 복구 테스트, TypeScript 검사, ESLint, Rust Clippy,
프로덕션 프런트엔드 빌드가 통과했다.

주요 변경 파일은 `.github/workflows/update-e2e.yml`, `scripts/update-e2e/`,
`scripts/tauri-release.mjs`, `scripts/sign-windows.mjs`,
`src-tauri/src/commands/release_notes.rs`와 변경 내역 UI다.

## 검증 범위의 한계

- macOS는 각 CPU용 바이너리로 실행했다. production universal 패키징 자체의
  A→B 실행은 별도이며 release workflow의 `lipo`·서명·공증 검사를 유지한다.
- 일반 사용자 PC의 SmartScreen 평판, UAC 거부, 보안 제품별 동작, 실제 사용자의
  캡처·분석·저장 전체 동작을 이 테스트가 대신하지 않는다.
- 다운로드 중 강제 종료, 디스크 부족, 설치 권한 거부는 이번 7개 E2E 시나리오에 없다.
- QA 설치 파일은 테스트 UI와 일회용 피드를 포함하므로 사용자에게 배포하지 않는다.
- production 릴리스 생성·공개·피드 변경은 수행하지 않았다.

## 다음 배포에서 확인할 항목

- production universal DMG의 두 CPU 실행과 실제 사용자 기기의 다운로드·Gatekeeper 흐름.
- 설치 권한 거부·디스크 부족 등 위 7개 시나리오 밖의 실패 조건.
- Apple Silicon 초기 실행 시간 초과가 재현되면 수집된 네이티브 스레드 표본으로 원인 분석.
- 기존 사용자에게 자동 업데이트 기능이 처음 포함된 버전은 기존 방식으로 한 번 설치한 뒤,
  이후 버전부터 자동 다운로드와 다음 실행 시 설치가 적용되는지 확인.
