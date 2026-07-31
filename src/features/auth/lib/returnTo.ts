const HOME = "/app/home";

/**
 * 로그인 후 돌아갈 경로.
 *
 * 이메일 로그인은 react-router의 location.state로 넘기면 되지만, 소셜 로그인은 외부
 * 브라우저를 거쳐 딥링크로 돌아오기 때문에 그 사이 라우터 상태가 남지 않는다. 그래서
 * 소셜 흐름을 시작할 때만 여기에 적어둔다.
 */
let pending: string | null = null;

export function setPendingReturnTo(path: string | null): void {
  // 오픈 리다이렉트 방지: 앱 내부 경로만 받는다.
  pending = path && path.startsWith("/") && !path.startsWith("//") ? path : null;
}

/** 적어둔 경로를 꺼내고 비운다. 없으면 홈. */
export function takePendingReturnTo(): string {
  const path = pending ?? HOME;
  pending = null;
  return path;
}

export { HOME as DEFAULT_RETURN_TO };
