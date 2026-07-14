import { QueryClient } from "@tanstack/react-query";

/** 서버 상태 단일 클라이언트. Query Key 관례는 docs/09 §6. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
