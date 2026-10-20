# 서명된 설치 파일 A→B 업데이트 검증

상태: 최종 실행 결과 확인 중. production 배포는 수행하지 않았다.

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
7. 확인 기록: 팝업 확인 후 재실행 시 반복되지 않으며 설정의 변경 내역을 다시 열 수 있다.

## 발견하여 수정한 문제

- macOS 업데이트 아카이브의 공증 티켓 누락: Intel B는 코드서명이 유효하고 Gatekeeper도
  승인했지만 `stapler validate`가 실패했다. 최종 `.app`에 티켓을 부착하고 아카이브를
  다시 만든 뒤, 압축을 풀어 코드서명과 티켓을 검증한다. 마지막으로 updater 서명을
  다시 생성한다. release workflow도 동일한 `scripts/tauri-release.mjs`를 사용한다.
- Windows NSIS 언인스톨러 서명: SSL.com이 NSIS 임시 파일의 `.tmp` 확장자를 거부했다.
  전용 임시 폴더의 `.exe` 복사본에 서명하고 유효성·타임스탬프 확인 후 원본에 반영한다.
  E2E에서 설치된 A/B 앱과 언인스톨러까지 서명을 검사한다.
- Windows 테스트 드라이버: PowerShell 7의 모듈 경로를 상속한 PowerShell 5에서
  서명 검사 모듈 로드가 실패했다. 드라이버가 호스트의 `pwsh`를 사용하도록 수정했다.
- Apple 티켓 서버의 일시적 연결 오류: 오류 68만 최대 두 번 재시도한다.
  티켓 누락·불일치 오류를 무시하거나 검증 성공으로 처리하지 않는다.

## 증거

최종 CI 실행과 플랫폼별 결과는 완료 후 여기에 기록한다.
`updater-e2e-evidence-<platform>`에는 `results.json`, `events.jsonl`,
`os-signatures.txt`, HTTPS 요청 기록을 보관한다. 모든 시나리오와 사후 검사가
끝난 경우에만 `allPassed: true`다. 증거 보관 기간은 14일, QA 설치 파일은 7일이다.

## 검증 범위의 한계

- macOS는 각 CPU용 바이너리로 실행했다. production universal 패키징 자체의
  A→B 실행은 별도이며 release workflow의 `lipo`·서명·공증 검사를 유지한다.
- 일반 사용자 PC의 SmartScreen 평판, UAC 거부, 보안 제품별 동작, 실제 사용자의
  캡처·분석·저장 전체 동작을 이 테스트가 대신하지 않는다.
- 다운로드 중 강제 종료, 디스크 부족, 설치 권한 거부는 이번 7개 E2E 시나리오에 없다.
- QA 설치 파일은 테스트 UI와 일회용 피드를 포함하므로 사용자에게 배포하지 않는다.
- production 릴리스 생성·공개·피드 변경은 수행하지 않았다.
