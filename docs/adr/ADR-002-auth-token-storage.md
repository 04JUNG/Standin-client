# ADR-002: 인증 토큰 저장 방식

- 상태: 승인됨(구현 완료)
- 날짜: 2026-07-14 (구현·확정 2026-07-31)
- 관련 문서: docs/02_APP_ARCHITECTURE.md §6, docs/06_AUTH_SPEC.md §6, docs/11_QA_SECURITY_RELEASE.md §3

## 배경

세션 복원과 로그아웃을 구현하려면 refresh token을 앱 재실행 후에도 안전하게 보관해야 한다. 문서는 "OS 보안 저장소 또는 검증된 secure storage plugin"을 권장하지만 구체적 방식이 미정이라 auth 착수를 막는다.

제약:

- access token은 메모리, refresh token만 영속(docs/06 §6).
- localStorage 평문 장기 저장 금지, 토큰 로그 출력 금지(docs/11 §3).
- Tauri v2 기준(ADR 전제). capability로 플러그인 권한을 명시해야 한다.
- 서버 인증 방식(회전 여부 등)이 확정 전이라 `AuthStorage` 인터페이스로 추상화가 필요.

## 선택지

### A. OS 키체인 기반 (`tauri-plugin-keyring` / OS Credential Manager)

- 장점: Windows Credential Manager, macOS Keychain을 사용해 refresh token만 안전 보관. 개념이 단순하고 감사 용이.
- 단점: 플랫폼별 동작 차이. 소량 문자열 저장에 적합, 대용량엔 부적합(여기선 문제 없음).

### B. `tauri-plugin-stronghold`

- 장점: 암호화된 로컬 저장소. 다수 비밀을 다룰 때 확장성.
- 단점: 사용자 패스프레이즈/키 관리가 추가로 필요. refresh token 하나 저장에는 과한 복잡도.

### C. 앱 데이터 디렉터리에 평문/약한 인코딩 저장

- 보안 요구(docs/11)에 위배되므로 제외.

## 결정

**A. OS 키체인 기반 secure storage**를 권장하고, 앱은 `AuthStorage` 인터페이스 뒤에서만 접근한다.

```ts
interface AuthStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}
```

근거:

- 저장 대상이 refresh token 하나이므로 OS 키체인이 복잡도/보안 균형에서 최적.
- 인터페이스로 감싸면 서버 인증 방식이 바뀌어도(회전 토큰 등) 구현 교체가 쉽다.

## 결과

- Rust command로 `get_secure_token` / `set_secure_token` / `clear_secure_token`을 노출한다(`src-tauri/src/commands/secure_store.rs`). `keyring` 크레이트를 쓰고 서비스명은 번들 식별자 `app.standin.desktop`, 계정명은 `refresh_token`.
  - **capability는 한 줄도 추가하지 않았다.** `generate_handler!`에 등록한 자체 command는 permission 대상이 아니다. JS 저장소 플러그인을 쓰면 그 권한을 통째로 열어야 하므로, 자체 command 쪽이 최소 권한 원칙에 더 부합한다(docs/11 §3, `shortcuts.rs`와 같은 판단).
  - 브라우저(Vite dev)에는 키체인이 없으므로 인메모리 구현으로 갈라진다(`authStorage.memory.ts`). dev에서 새로고침 시 로그아웃되는 것은 의도된 동작이다.
- access token은 메모리(`shared/api/client.ts` 모듈 변수)에만 둔다.
- **refresh 동시성**: 여러 요청이 동시에 401을 받을 때 refresh를 한 번만 수행하고 나머지를 대기시키는 single-flight를 API client에 구현한다.

## 서버 확인 결과 (2026-07-31, `Standin-app-server` 코드 기준)

문서의 미해결 질문(docs/08 §11)은 BFF 구현으로 모두 확정됐다.

- **refresh token 회전: 한다.** 유효 jti를 DB 화이트리스트로 두고, 회전 시 이전 jti를 삭제한다. 즉 refresh token은 **1회용**이다 → single-flight가 선택이 아니라 필수다. 동시에 두 번 보내면 하나는 반드시 401.
- **refresh 요청 형식: 쿠키가 아니라 body.** `POST /v1/auth/refresh` `{ refreshToken }`. `POST /v1/auth/logout`도 `{ refreshToken }`을 받아 서버 측 토큰을 폐기한다.
- **refresh 응답에는 `user`가 없다.** 토큰 3필드뿐이므로 세션 복원 시 `GET /v1/users/me`로 유저를 따로 채운다.
- access token 수명은 서버 `ACCESS_TOKEN_TTL`(기본 900초), refresh는 `REFRESH_TOKEN_TTL`(기본 14일).

## 결과 (기타)

- 재검토 조건: 저장할 비밀이 늘어나면(예: 다중 계정) stronghold로 재평가.
