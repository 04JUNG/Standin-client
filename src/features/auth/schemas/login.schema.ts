import { z } from "zod";

/**
 * 로그인 폼 검증. 클라이언트에서 과도한 비밀번호 정책을 임의로 추가하지 않는다(docs/06 §3).
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "이메일과 비밀번호를 입력해 주세요.")
    .email("이메일 형식을 확인해 주세요."),
  password: z.string().min(1, "이메일과 비밀번호를 입력해 주세요."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
