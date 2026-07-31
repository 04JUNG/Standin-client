import { Button } from "@/shared/components/Button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { useLogout } from "../hooks/useLogout";

/**
 * 로그아웃 버튼 + 확인 대화상자. 홈과 설정 양쪽에서 쓴다(docs/03 §3, §9).
 */
export function LogoutButton({ variant = "secondary" }: { variant?: "secondary" | "ghost" }) {
  const { confirmOpen, pending, requestLogout, cancelLogout, confirmLogout } = useLogout();

  return (
    <>
      <Button variant={variant} size="md" onClick={requestLogout}>
        로그아웃
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="로그아웃"
        description="로그아웃하면 이 기기에서 세션이 삭제됩니다. 다시 로그인해야 합니다."
        confirmLabel="로그아웃"
        destructive
        loading={pending}
        onConfirm={() => void confirmLogout()}
        onCancel={cancelLogout}
      />
    </>
  );
}
