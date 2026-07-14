# 로그인·로그아웃 명세

## 1. 범위

MVP:

- 이메일·비밀번호 로그인
- 세션 복원
- 로그아웃
- 토큰 만료 시 재인증
- 인증이 필요한 라우트 보호

MVP 제외:

- 소셜 로그인
- 앱 내 회원가입
- 앱 내 비밀번호 재설정
- 2단계 인증
- 계정 삭제

회원가입과 비밀번호 찾기는 Next.js 웹으로 연결한다.

---

## 2. 사용자 흐름

### 첫 로그인

```text
앱 실행
→ 저장된 refresh token 없음
→ 로그인 화면
→ 이메일·비밀번호 입력
→ 서버 인증
→ token 저장
→ 사용자 정보 조회
→ 홈
```

### 세션 복원

```text
앱 실행
→ refresh token 있음
→ refresh 요청
├─ 성공 → 홈
└─ 실패 → token 삭제 → 로그인
```

### 로그아웃

```text
사용자 메뉴
→ 로그아웃
→ 확인
→ 서버 세션 무효화 요청
→ 로컬 token 삭제
→ Query cache 삭제
→ 로그인 화면
```

서버 로그아웃 요청이 실패해도 로컬 세션은 제거한다.

---

## 3. 화면 필드

### Email

- required
- trim
- 기본 이메일 형식 검증
- 자동완성 허용

### Password

- required
- 비밀번호 표시 토글
- 최소 길이 정책은 서버와 일치
- 클라이언트에서 과도한 정책을 임의로 추가하지 않음

---

## 4. 에러 메시지

| 상황 | 사용자 메시지 |
|---|---|
| 필드 누락 | 이메일과 비밀번호를 입력해 주세요. |
| 인증 실패 | 이메일 또는 비밀번호를 확인해 주세요. |
| 네트워크 실패 | 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요. |
| 서버 점검 | 현재 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요. |
| 세션 만료 | 세션이 만료되었습니다. 다시 로그인해 주세요. |
| 과도한 시도 | 잠시 후 다시 시도해 주세요. |

이메일 존재 여부를 구분하지 않는다.

---

## 5. 클라이언트 인터페이스

```ts
type LoginInput = {
  email: string;
  password: string;
};

type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  user: AuthUser;
};

interface AuthService {
  login(input: LoginInput): Promise<AuthSession>;
  refresh(): Promise<AuthSession>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<AuthUser>;
}
```

실제 서버 응답을 UI 타입과 직접 결합하지 말고 adapter에서 변환한다.

---

## 6. 저장 전략

권장:

- Access token: 메모리
- Refresh token: OS secure storage
- User profile: Query cache
- 이메일 기억: 사용자가 선택하면 일반 설정 저장 가능

금지:

- 비밀번호 저장
- 토큰 console 출력
- 토큰 URL query에 포함
- 장기 토큰 localStorage 평문 저장

---

## 7. 인증 가드

상태:

```ts
type AuthStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated";
```

- initializing 중에는 splash 또는 skeleton
- authenticated에서 auth 화면 접근 시 홈 이동
- unauthenticated에서 app 화면 접근 시 로그인 이동

---

## 8. 이번 주 Mock 구현

서버 계약이 미완성이라면:

```text
demo@standin.app
password
```

같은 개발 전용 계정을 사용할 수 있다.

조건:

- 운영 빌드에서 Mock 비활성
- 화면에 Mock 모드임을 개발 배지로 표시
- Mock credential을 실제 제품 문구에 넣지 않음
- 서비스 인터페이스는 HTTP 구현과 동일

---

## 9. 테스트 시나리오

- 올바른 로그인
- 잘못된 로그인
- 버튼 중복 클릭
- 네트워크 끊김
- 앱 재실행 후 세션 복원
- 만료된 refresh token
- 로그아웃 성공
- 로그아웃 API 실패 후 로컬 로그아웃
- Query cache에 이전 사용자 데이터가 남지 않음
