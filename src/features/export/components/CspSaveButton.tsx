import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { apiFetchResponse } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { bodyKeys, getSelection } from "@/features/body-selection/api";
import { exportService } from "../api/export.service";
import { ExportError } from "../api/export.contract";
import { useExportStore } from "../store/exportStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";

export function cspSaveUrl(
  jobId: string,
  personIndex: number,
  candidateId: string,
  poseId: string,
  revision: number,
) {
  return (
    "/v1/csp-shape/bundle?" +
    new URLSearchParams({
      jobId,
      personIndex: String(personIndex),
      candidateId,
      poseId,
      bodySelectionRevision: String(revision),
    })
  );
}
export async function checkedCspDownload(url: string, signal?: AbortSignal) {
  const response = await apiFetchResponse(url, { auth: false, signal });
  if (!response.headers.get("Content-Type")?.startsWith("application/zip"))
    throw new Error("인형 파일 형식을 확인하지 못했어요.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== response.headers.get("X-Standin-Artifact-SHA256"))
    throw new Error("인형 파일을 검증하지 못했어요. 다시 시도해 주세요.");
  return bytes;
}
type Props = {
  jobId: string;
  personIndex: number;
  candidateId: string;
  poseId: string;
  characterIds?: string[];
};
export function CspSaveButton(props: Props) {
  return props.characterIds ? (
    <EnabledCspSaveButton {...props} characterIds={props.characterIds} />
  ) : null;
}
function EnabledCspSaveButton({
  jobId,
  personIndex,
  candidateId,
  poseId,
  characterIds,
}: Props & { characterIds: string[] }) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const selected = useQuery({
    queryKey: bodyKeys.selection(owner, jobId, personIndex),
    queryFn: ({ signal }) => getSelection(jobId, personIndex, signal),
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  const body = selected.data?.resolvedBody;
  const supported =
    !!body &&
    characterIds.includes(body.characterId) &&
    selected.data?.resolutionStatus === "ready";
  async function save() {
    if (!supported || !selected.data) return;
    setBusy(true);
    setMessage("");
    const control = new AbortController();
    active.current = control;
    try {
      const revision = selected.data.selectionRevision;
      const bytes = await checkedCspDownload(
        cspSaveUrl(jobId, personIndex, candidateId, poseId, revision),
        control.signal,
      );
      let folder = useExportStore.getState().folder;
      if (!folder) folder = await exportService.getDefaultFolder();
      if (!(await exportService.folderExists(folder)))
        folder = await exportService.chooseFolder(folder);
      if (!folder) return;
      const fresh = await getSelection(jobId, personIndex, control.signal);
      control.signal.throwIfAborted();
      if (
        fresh.selectionRevision !== revision ||
        usePoseSelectionStore.getState().selectedByPerson[personIndex] !== candidateId
      )
        throw new Error("selection changed");
      const paths = await exportService.saveCandidates({
        folder,
        files: [{ fileName: `standin_CSP_인물${personIndex + 1}.zip`, content: bytes }],
      });
      setMessage("저장했어요. ZIP을 풀어 인형을 가져온 뒤 포즈를 적용하세요.");
      if (paths[0]) await exportService.revealInFolder(paths[0].path).catch(() => undefined);
    } catch (e) {
      if (!control.signal.aborted && !(e instanceof ExportError && e.code === "CANCELLED"))
        setMessage(
          "저장하지 못했어요. 체형과 포즈를 다시 확인해 주세요. 손 모양을 선택했다면 FBX 저장을 이용해 주세요.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1 p-2">
      <Button variant="secondary" disabled={!supported || busy} onClick={() => void save()}>
        {busy ? "인형 준비 중…" : "CSP 인형·포즈 저장"}
      </Button>
      <p className="text-[11px] text-text-secondary">
        {message ||
          (supported
            ? "조절한 체형을 ZIP으로 저장해요. 손 모양·카메라는 포함되지 않아요."
            : "체형 설정에서 CSP용 모델을 선택해 주세요.")}
      </p>
    </div>
  );
}
