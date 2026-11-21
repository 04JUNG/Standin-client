# 서명된 스테이징 앱과 업데이트 피드

스테이징 앱도 Mac 서명·공증과 서명된 자동 업데이트 자산을 갖춘다. 설치 대상은
`Standin Staging` / `app.standin.desktop.staging`이며, API·딥링크·키체인 서비스는 기존
스테이징 값을 유지한다. 운영 앱의 설정과 `releases/latest` 피드는 변경하지 않는다.

## 검증과 게시

`release-staging-desktop.yml`은 실제 스테이징 빌드를 `develop`에서만 실행한다. Mac은 Apple
인증서·서명 ID·Team ID·공증 API 자격, 업데이트는 기존 minisign 키 쌍이 모두 있어야 한다.
`signingIdentity: "-"`를 제거해 정식 인증서 서명을 사용한다. 계약 동의는 계정 소유자의
일이며 워크플로가 대신 수행하지 않는다.

두 플랫폼의 빌드와 기존 서명/공증 검증이 성공한 뒤 `latest.json`을 검사한다. 세 플랫폼
항목에 서명이 있어야 하고, 자산 URL은 같은 버전의 `v<VERSION>-staging` 릴리스를
가리켜야 한다. 버전·플랫폼 누락, 운영 릴리스 URL, 잘못된 경로는 거절한다.

`draft=false`를 명시한 실행만 검증된 버전 릴리스를 게시한다. 스테이징 릴리스와 별도
`staging-updates` 피드는 모두 prerelease이고 `latest=false`다. 게시가 완료된 뒤에만
`staging-updates/latest.json`을 교체한다. 실제 앱의 업데이트 주소는 다음 한 곳이다.

`https://github.com/04JUNG/Standin-client/releases/download/staging-updates/latest.json`

기존 0.2.3 스테이징 앱은 업데이트 주소가 비어 있으므로 첫 서명 버전은 DMG로 직접
설치해야 한다. 그다음 버전부터 새 피드를 이용한다. 운영 2.10.6의 중단된 릴리스를
재개하는 절차가 아니다.

## 빌드 없는 Apple 확인

`notarization_preflight=true`로 실행하면 Apple의 공증 이력 API에만 인증한다. 앱 빌드,
자산 업로드, 태그·릴리스·업데이트 피드 변경은 실행하지 않는다. 이 검사는 Apple의 공식
Notary API를 Linux에서 읽어 Mac 빌드 러너의 용량 부족과 자격 오류를 구분한다. 키와
짧은 만료 시간의 JWT는 메모리에서만 사용하고 출력하지 않는다. 실제 앱 빌드의
`notarytool` 공증과 서명·stapler 검증은 그대로 유지한다. API 응답의 계약 미서명·만료
오류는 우회하지 않는다.

검증: `npx vitest run scripts/validate-staging-update.test.mjs`, TypeScript 검사, 웹 빌드.
실제 Mac 서명·공증·설치·업데이트 확인은 해당 릴리스 실행 결과로 별도 기록한다.

## 운영 workflow 보존

서명된 스테이징 빌드는 별도 `release-staging-desktop.yml`에서만 실행합니다. API·앱 환경·키체인·태그는 staging으로 고정합니다. 기존 `release-desktop.yml`은 이 PR에서 변경하지 않으므로, 최신 main으로 필요한 파일만 옮길 때 운영 campaign package·draft 조회·updater finalize·v2.10.6 방향 수정은 그대로 유지됩니다. 이 스테이징 업데이트 경로는 운영 모델 교체의 필수 변경과 별도이며, 이번 작업에서는 workflow 실행·앱 게시·업데이트 피드 변경을 수행하지 않습니다.

2026-11-21 기준 Apple 계약 오류는 해결됐고 운영 v2.10.6 공개도 완료됐습니다. 이전 HTTP 403은 현재 차단 사유가 아닙니다.
