# ADR-002: 인증 토큰 저장 방식

- 상태: 제안됨
- 날짜: 2026-07-14
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

- Rust command로 `get_secure_token` / `set_secure_token` / `clear_secure_token`을 노출하고, capability를 최소 범위로 제한(docs/11 §3).
- access token은 메모리(예: Zustand 비영속 슬라이스 또는 모듈 변수)에만 둔다.
- **refresh 동시성**: 여러 요청이 동시에 401을 받을 때 refresh를 한 번만 수행하고 나머지를 대기시키는 single-flight를 API client에 구현한다(별도 구현 항목).
- 서버팀 확인 필요(docs/08 §11): refresh token 회전 여부, refresh 요청 형식(body vs 쿠키).
- 재검토 조건: 저장할 비밀이 늘어나면(예: 다중 계정) stronghold로 재평가.
