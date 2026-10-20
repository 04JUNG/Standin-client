# Universal DMG 검증과 초기 실행 시간 초과 조사

## 결론

Universal DMG의 공증 후 재구성에서 디스크 이미지 내부 공간 부족을 재현하고 수정했다.
Apple Silicon·Intel에서 실제 Universal A→B 업데이트가 통과했으며 Windows 회귀
검사를 포함한 21개 시나리오가 모두 성공했다.
초기 실행 시간 초과는 새 Universal 앱 100회와 원본 서명 바이너리 200회,
총 300회의 추가 시작 검사에서 재현되지 않았다.
원래 실패 당시에는 네이티브 스레드 기록이 없어 근본 원인을 확정할 수 없다.
재발 시 시작 단계와 스레드 상태를 수집하도록 QA 진단을 추가했다.

production 릴리스나 업데이트 피드는 변경하지 않았다.

## Universal 패키징 수정

[첫 Universal 실행](https://github.com/04JUNG/Standin-client/actions/runs/39433802703)의
Apple Silicon 빌드에서 공증된 앱을 DMG 안에 `ditto`로 복사하다
`Contents/MacOS/standin-desktop: No space left on device`로 실패했다.
앱 코드서명과 Apple 공증은 이미 성공한 뒤였다.

`scripts/tauri-release.mjs`는 압축 DMG를 UDRW 작업 이미지로 변환한 다음
공증 티켓이 포함된 앱을 다시 복사한다. 기존 볼륨은 Universal 실행 파일을
교체하는 동안 필요한 추가 공간을 확보하지 않았다.
작업 이미지와 HFS+ 볼륨을 원래 이미지 크기의 두 배에 32 MiB를 더한 크기로
확장하도록 수정했다. Tauri의 볼륨 배경과 배치를 보존하며, 최종 서명·공증 티켓
검사가 모두 성공한 뒤에만 원래 DMG를 교체한다.

같은 실행의 Intel 빌드는 Apple 공증 승인 후 티켓 검증 서버와의 연결이 끊겼다.
로그에는 `NSURLErrorDomain Code=-1005`, `api.apple-cloudkit.com`,
`stapler validate Error 68`이 남았다. 기존 제한된 재시도 후에도 실패했으며
검사를 생략하지 않았다. 이는 앱 시작 시간 초과와 다른, 빌드 중 네트워크 오류다.

## 최종 서명 설치 검증

- 검증 커밋: `5e9e279109c33d1f2782e7ceebf0f59743a9cb8f`
- [CI 실행 39435409376](https://github.com/04JUNG/Standin-client/actions/runs/39435409376)
- 버전: `0.1.1-beta.9` → `0.1.1-beta.10`
- 식별자: `app.standin.desktop.update-e2e`
- macOS 빌드 대상: 두 러너 모두 `universal-apple-darwin`

| 실행 환경 | A→B 시나리오 | 추가 시작 검사 |
| --- | --- | --- |
| macOS Apple Silicon | 7/7 통과 | A 25회 + B 25회 통과 |
| macOS Intel | 7/7 통과 | A 25회 + B 25회 통과 |
| Windows x64 | 7/7 통과 | 이번 추가 반복 검사 대상 아님 |

각 macOS 러너는 일회용 updater 키와 TLS CA를 별도로 생성한다. 두 러너의
패키지는 같은 소스로 빌드하지만 코드서명·공증·테스트 키 때문에 해시가 서로 다르다.
각 러너에서 검증한 A/B 패키지의 해시는 별도로 보관한다.
[영구 결과 요약 JSON](2026-10-20-universal-updater-results.json)에 실행 커밋,
21개 시나리오, 패키지 해시, 시작 시간 통계와 원본 바이너리 조사 결과를 기록했다.

검사 항목:

1. A/B DMG 외부 서명과 내부 앱의 `codesign`, `stapler validate`, `spctl` 검사.
2. 두 DMG의 실행 파일에 `arm64`, `x86_64`가 모두 포함되는지 `lipo` 검사.
3. DMG에서 설치한 A의 실행 파일과 DMG 내부 파일의 SHA-256 일치.
4. 실제 updater로 B를 설치·재시작한 뒤 네이티브 버전과 실행 CPU 확인.
5. 설치된 B의 실행 파일이 B DMG 내부 파일과 같고 두 CPU 코드가 유지되는지 확인.
6. 서명 변조 거부, 자동 다운로드, 작업 중 설치 차단, 오프라인 유지,
   캐시 변조 거부·복구, 완료 팝업, 확인 기록의 재시작 후 보존, 설정 이력 확인.
7. 실제 프로세스 종료 직후 다음 실행을 시작하는 A/B 반복 검사.

고정 2초 대기 후 최초 프로세스만 기다리던 테스트 제어도 개선했다.
업데이트로 새로 실행된 B의 PID까지 종료를 확인한다. 이 개선을
과거의 초기 실행 시간 초과 원인이나 해결로 간주하지 않는다.

두 러너의 A/B 설치 파일을 내려받아 DMG SHA-256과 updater 아카이브 안 실행 파일의
SHA-256을 결과 기록과 다시 대조했다. 네 실행 파일의 Mach-O 헤더를 로컬에서
독립적으로 읽어 `x86_64`·`arm64` 포함 여부도 확인했다.

## 원본 바이너리로 조사한 초기 실행 시간 초과

과거 [실행 39422374014](https://github.com/04JUNG/Standin-client/actions/runs/39422374014)의
첫 Apple Silicon 시도에서는 `recover`까지 성공한 다음 `upgrade` 실행이
240초 동안 초기 이벤트를 보내지 않았다. 새 HTTPS 요청도 없었고 프로세스는
살아 있었다. 당시 stdout/stderr는 비어 있으며 스레드 표본이 없어,
플러그인·AppKit·WebView·최초 IPC 중 어디에서 멈췄는지 판별할 수 없다.

새 진단 코드가 시작 동작을 바꿀 가능성을 구분하기 위해 당시의 **수정하지 않은**
서명 바이너리도 별도로 실행했다.

- 원본 artifact ID: `12265671389` — 최초 실패 시도, 재실행의 파일과 구분.
- 원본 ZIP SHA-256:
  `ddce9cca2dc6a83b15fec4a94da7d803e25b587677117ef94493f1a99c5128bd`
- ZIP 해시와 앱 코드서명 검사를 통과한 후 원본 A/B를 실행했다.
- 기존 테스트 UI에는 시작 전용 시나리오가 없어, 실제 시작 처리가 끝난 후의
  `Unknown scenario probe-startup` 응답과 정상 프로세스 종료를 시작 도달 증거로 사용했다.
  이 응답을 updater 기능 테스트 성공으로 계산하지 않는다.

| 조사 실행 | 조건 | 결과 | 첫 화면 이벤트 최대 |
| --- | --- | --- | --- |
| [39437017030](https://github.com/04JUNG/Standin-client/actions/runs/39437017030) | 원본 A/B 각 50회, 오프라인·설치 캐시 없음 | 100/100 시작 도달 | 4.553초 |
| [39437819011](https://github.com/04JUNG/Standin-client/actions/runs/39437819011) | 원본 A 25회 캐시 없음 + 25회 B 설치 준비 캐시, 원본 B 50회 | 100/100 시작 도달 | 4.050초 |

두 번째 조사에서 설치 준비 캐시가 있는 25회는 모두 오프라인 복구 경로로
화면에 도달했다. 첫 화면 이벤트는 최대 1.094초였고, 실제 설치 전의 오프라인
실패에서는 `attempted: false`를 유지했으며 B 실행 후에는 설치 완료 캐시가 정리됐다.
원래 테스트 TLS 개인키는 artifact에 보관하지 않았으므로, 원본 바이너리의
설치 준비 상태 조사는 오프라인 경로로 한정한다. 실제 HTTPS 업데이트는
최종 Universal 검증에서 수행한다.

따라서 **초기 240초 시간 초과의 근본 원인은 미확정**이다.
정상 반복 실행만으로 과거 문제가 해결됐거나 runner/WebKit 결함이었다고 단정하지 않는다.

## 재발 진단과 증거

Cargo `update-e2e` 빌드에만 다음 기록을 추가했다. 일반 앱에는 QA IPC나 TLS CA가 포함되지 않는다.

- `native-startup.jsonl`: PID, 네이티브 버전, CPU, 시각과 네이티브 진입·플러그인·
  setup·이벤트 루프·페이지 로드·첫 WebView IPC·종료 단계.
- `results.json`: 각 시작의 첫 이벤트와 종료까지 걸린 시간, DMG/실행 파일 해시,
  포함 CPU, 업데이트 시나리오와 반복 실행 결과.
- 초기 이벤트가 20초 동안 없으면 앱/WebKit 프로세스 목록, `sample` 스레드 표본,
  관련 macOS 시스템 로그를 수집한다. 240초 제한은 그대로 실패 처리한다.
- 자동 재실행으로 실패를 통과 처리하지 않는다.

각 macOS 환경의 최종 검증은 58개 네이티브 프로세스 모두 시작·WebView 초기화·
종료 기록을 남겼다. 추가 시작 검사의 시간은 다음과 같다. 이는 QA 러너와
진단 빌드에서 측정한 시간이며 일반 사용자 기기의 성능 보장 값이 아니다.

| 환경 | A 첫 이벤트 중앙값 / 최대 | B 첫 이벤트 중앙값 / 최대 |
| --- | --- | --- |
| Apple Silicon | 1.848 / 2.730초 | 1.746 / 1.918초 |
| Intel | 1.125 / 3.530초 | 1.159 / 1.966초 |

세 번의 성공한 조사 실행 전체에서 20초 진단 수집이나 240초 시간 초과는 없었다.
로컬 TypeScript·ESLint, QA 프런트엔드 빌드, 일반/`update-e2e` Rust Clippy,
Python/YAML 구문 검사도 통과했다.

증거 artifact 보관 기간은 14일, QA 설치 파일은 7일이다. 원본 재현 워크플로는
위에 고정한 과거 artifact를 사용하는 조사 도구로, 해당 artifact가 만료되면
동일 파일을 다시 받을 수 없다. 지속적인 회귀 검사는 `update-e2e.yml`이 담당한다.

## 범위

실제 OS 서명·공증, Universal 코드, DMG 설치, 네이티브 updater와 UI를 검사했다.
설치 등록·투어 상태와 릴리스 B 설명은 QA fixture이며 BFF/production 피드는 사용하지 않는다.
일반 사용자 기기의 Gatekeeper 다운로드 UI, 모든 보안 제품, 설치 권한 거부,
디스크 부족 복구 전체를 검증한 것은 아니다. 위 공간 부족 수정은 **빌드 과정의
DMG 내부 여유 공간**에 대한 것으로, 사용자 디스크 부족 처리와 구분한다.
