import { Button } from "@/shared/components/Button";
import { useExportStore } from "@/features/export/store/exportStore";
/** Generated manual use includes the final body/hand/scope FBX review. */
export function GeneratedFbxNotice() {
  const setFormat = useExportStore((s) => s.setFormat);
  return (
    <div className="text-xs text-text-secondary">
      <p>새로 만든 포즈는 저장할 모습을 확인한 뒤 FBX로 저장해 주세요.</p>
      <Button variant="ghost" size="sm" onClick={() => setFormat("fbx")}>
        FBX로 확인하기
      </Button>
    </div>
  );
}
