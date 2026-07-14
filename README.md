# Standin Desktop App Documentation

Tauri 기반 Standin PC 앱 개발을 위한 문서 세트다.

## 문서 구조

```text
CLAUDE.md
docs/
├─ 01_PRODUCT_AND_MVP.md
├─ 02_APP_ARCHITECTURE.md
├─ 03_USER_FLOW_AND_SCREENS.md
├─ 04_DESKTOP_UI_GUIDE.md
├─ 05_REPOSITORY_AND_COLLABORATION.md
├─ 06_AUTH_SPEC.md
├─ 07_CAPTURE_AND_UPLOAD_SPEC.md
├─ 08_API_CONTRACT.md
├─ 09_STATE_AND_DATA_MODEL.md
├─ 10_THIS_WEEK_PLAN.md
└─ 11_QA_SECURITY_RELEASE.md
```

## Claude 시작 프롬프트

> 루트의 CLAUDE.md와 docs 폴더 문서를 순서대로 읽고 Standin Tauri 앱을 구현해줘. Python 서버와 Next.js 랜딩페이지는 별도 레포이므로 구현하지 말고, 서버 연동은 API client와 Mock adapter 경계까지만 구성해줘. 이번 주 범위는 UI 기반, 로그인·로그아웃, 파일 입력, 화면 캡처와 캡처 미리보기까지야. 먼저 현재 레포 구조를 확인하고 문서와 충돌하는 부분을 정리한 뒤 구현해줘.

## 권장 첫 작업

1. Tauri + React + TypeScript 프로젝트 확인
2. `.env.example` 작성
3. 폴더 구조 생성
4. 디자인 토큰 적용
5. 인증 Mock adapter 구현
6. 로그인과 앱 셸 구현
7. 캡처 기능 구현
