import { useEffect, useState } from "react";
import { AlertCircle, FolderOpen } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { exportService } from "@/features/export/api/export.service";
import { useExportStore } from "@/features/export/store/exportStore";

/**
 * 설정의 기본 저장 폴더 섹션(docs/03 §9, ADR-009).
 *
 * 저장은 후보를 고르면 자동으로 일어나고 그때 경로를 묻지 않으므로, 이 값을 바꾸는 곳은
 * 여기 하나다. 저장 화면의 "다른 폴더에 저장"은 그 회차에만 적용되고 이 값을 건드리지 않는다.
 *
 * 폴더가 사라진 경우는 복구 행동이 필요하므로 Toast가 아니라 인라인 경고로 처리한다
 * (docs/04 §11).
 */
export function SaveFolderSection() {
  const folder = useExportStore((s) => s.folder);
  const setFolder = useExportStore((s) => s.setFolder);

  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  // 영속된 폴더가 삭제됐을 수 있으므로 표시 시점에 확인한다.
  useEffect(() => {
    let alive = true;

    async function check() {
      if (!folder) {
        try {
          const dir = await exportService.getDefaultFolder();
          if (alive) setFolder(dir);
        } catch {
          // 조회 실패는 저장 시점에 오류로 드러난다.
        }
        return;
      }
      const exists = await exportService.folderExists(folder);
      if (alive) setMissing(!exists);
    }

    void check();
    return () => {
      alive = false;
    };
  }, [folder, setFolder]);

  async function change() {
    setBusy(true);
    try {
      const picked = await exportService.chooseFolder(folder ?? undefined);
      if (picked) {
        setFolder(picked);
        setMissing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    try {
      const dir = await exportService.getDefaultFolder();
      setFolder(dir);
      setMissing(false);
    } catch {
      // 조회 실패는 저장 시점에 오류로 드러난다.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-bold text-text-primary">기본 저장 폴더</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          포즈 파일이 저장될 폴더입니다. 저장할 때마다 경로를 묻지 않습니다.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          <p
            className="min-w-0 flex-1 truncate text-[13px] text-text-primary"
            title={folder ?? undefined}
          >
            {folder ?? "불러오는 중…"}
          </p>
        </div>

        {missing && (
          <p role="alert" className="flex items-start gap-1.5 text-[12px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />이 폴더를 찾을 수
            없습니다. 다른 폴더를 지정하거나 기본값으로 되돌려 주세요.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="md" disabled={busy} onClick={() => void change()}>
            변경
          </Button>
          <Button variant="ghost" size="md" disabled={busy} onClick={() => void resetToDefault()}>
            기본값으로
          </Button>
        </div>
      </div>
    </section>
  );
}
