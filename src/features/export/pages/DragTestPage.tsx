import { useState } from "react";
import { Link } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertCircle, FolderOpen, GripVertical } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { cn } from "@/shared/lib/cn";
import { copyText } from "@/shared/lib/copyText";
import { dragService } from "../api/drag.service";
import { exportService } from "../api/export.service";
import sampleBvh from "./fixtures/sample_pose.bvh?raw";

/**
 * 임시 드래그 실험 페이지 — 커밋 대상 아님. `/dev/drag-test`(개발 빌드 전용).
 *
 * 목적: 앱 창 → 클립스튜디오 네이티브 드래그가 동작하는지 확인한다.
 *
 * 확인 순서(위에서 아래로):
 *  1) PNG — 모든 버전이 받는다. 여기서 실패하면 포맷 문제가 아니라 드래그 문제다
 *  2) OBJ — Ver 1.x부터 지원하는 3D 포맷. 3D 레이어가 생겨야 한다
 *  3) BVH — 실제로 생성된 포즈 파일. 데생 인형에 포즈가 적용되어야 한다
 *
 * BVH 샘플은 처음에 "실제 BVH 아님" 플레이스홀더 텍스트였는데, 그건 BVH 형식이 아니라
 * 클립스튜디오가 "지원하지 않는 형식의 파일"로 거절하는 게 당연했다. 지금은
 * `fixtures/sample_pose.bvh`에 둔 실제 생성 파일(Mixamo 리그, 1프레임)을 쓴다.
 *
 * 확인이 끝나면 이 파일, fixtures 폴더, 라우트, src-tauri/src/commands/dragtest.rs를
 * 함께 지운다.
 */

type Sample = {
  id: string;
  fileName: string;
  label: string;
  note: string;
  make(): Promise<string> | string;
};

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function describeBvh(text: string): string {
  const sizeKb = new TextEncoder().encode(text).byteLength / 1024;
  return `${sizeKb.toFixed(1)} KB`;
}

async function makePngBase64(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 컨텍스트를 만들 수 없습니다.");
  ctx.fillStyle = "#f5f2ec";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#ff6b5a";
  ctx.fillRect(96, 96, 320, 320);
  ctx.fillStyle = "#1b1b1f";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("DRAG TEST", 110, 270);
  return canvas.toDataURL("image/png").split(",")[1];
}

const OBJ_CUBE = [
  "# Standin 드래그 실험용 큐브",
  "v -1 -1 -1",
  "v 1 -1 -1",
  "v 1 1 -1",
  "v -1 1 -1",
  "v -1 -1 1",
  "v 1 -1 1",
  "v 1 1 1",
  "v -1 1 1",
  "f 1 2 3 4",
  "f 5 8 7 6",
  "f 1 5 6 2",
  "f 2 6 7 3",
  "f 3 7 8 4",
  "f 5 1 4 8",
  "",
].join("\n");

/** 실제 생성된 포즈 파일. Mixamo 리그 + 1프레임(`fixtures/sample_pose.bvh`). */
const BVH_SAMPLE = sampleBvh;

const SAMPLES: Sample[] = [
  {
    id: "png",
    fileName: "standin_drag_test.png",
    label: "1. PNG 이미지",
    note: "모든 버전이 받습니다. 실패하면 포맷이 아니라 드래그 자체의 문제입니다.",
    make: makePngBase64,
  },
  {
    id: "obj",
    fileName: "standin_drag_test.obj",
    label: "2. OBJ 큐브 (3D)",
    note: "Ver 1.x부터 지원. 캔버스에 3D 레이어가 생기면 성공입니다.",
    make: () => toBase64(OBJ_CUBE),
  },
  {
    id: "bvh",
    fileName: "standin_drag_test.bvh",
    label: "3. BVH 포즈 (실제 생성 파일)",
    // 크기를 함께 보여줘 픽스처가 비어 있지 않은지 눈으로 확인할 수 있게 한다.
    note: `Mixamo 리그 · 1프레임 · ${describeBvh(BVH_SAMPLE)}. 데생 인형에 포즈가 적용되면 성공입니다. 실패하면 오류 대화상자의 문구를 그대로 알려주세요.`,
    make: () => toBase64(BVH_SAMPLE),
  },
];

type Row = {
  sample: Sample;
  path: string;
  outcome: "idle" | "dragging" | "dropped" | "cancelled" | "failed";
};

export function DragTestPage() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canDrag = dragService.isSupported;

  function addLog(line: string) {
    const stamp = new Date().toLocaleTimeString();
    setLog((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 40));
  }

  function setOutcome(id: string, outcome: Row["outcome"]) {
    setRows((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], outcome } } : prev));
  }

  async function createAll() {
    setError(null);

    if (!isTauri()) {
      const message =
        "브라우저에서는 파일을 만들 수 없습니다. `npm run tauri dev`로 데스크톱 앱을 띄운 뒤 이 페이지를 여세요.";
      setError(message);
      addLog(message);
      return;
    }

    for (const sample of SAMPLES) {
      try {
        const contentBase64 = await sample.make();
        const result = await invoke<{ path: string }>("write_drag_test_file", {
          fileName: sample.fileName,
          contentBase64,
        });
        setRows((prev) => ({
          ...prev,
          [sample.id]: { sample, path: result.path, outcome: "idle" },
        }));
        addLog(`생성: ${sample.fileName}`);
      } catch (err) {
        const message =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
        setError(`${sample.fileName} 생성 실패: ${message}`);
        addLog(`생성 실패: ${sample.fileName} — ${message}`);
      }
    }
  }

  function handleDragStart(event: React.DragEvent, row: Row) {
    if (!canDrag) return;
    event.preventDefault();
    setOutcome(row.sample.id, "dragging");
    addLog(`드래그 시작: ${row.sample.fileName}`);

    void dragService
      .startFileDrag([row.path], (outcome) => {
        setOutcome(row.sample.id, outcome);
        addLog(`드래그 종료: ${row.sample.fileName} → ${outcome}`);
      })
      .catch((err: unknown) => {
        setOutcome(row.sample.id, "failed");
        addLog(`드래그 시작 실패: ${row.sample.fileName} — ${String(err)}`);
      });
  }

  const created = SAMPLES.map((s) => rows[s.id]).filter((r): r is Row => Boolean(r));

  return (
    <div className="min-h-screen bg-surface-1 p-6">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <Link to="/app/home" className="text-[12px] text-text-secondary hover:text-text-primary">
            ← 앱으로 돌아가기
          </Link>
          <h1 className="text-[18px] font-bold text-text-primary">드래그 실험 (임시 페이지)</h1>
          <p className="text-[13px] text-text-secondary">
            앱 창에서 클립스튜디오 캔버스로 파일을 끌어놓을 수 있는지 확인합니다. 위에서부터 차례로
            시도하세요.
          </p>
          <p
            className={cn(
              "text-[12px] font-semibold",
              canDrag ? "text-brand-sky" : "text-brand-coral",
            )}
          >
            네이티브 드래그: {canDrag ? "지원 (데스크톱 앱)" : "미지원 — tauri dev로 실행하세요"}
          </p>
        </header>

        <div className="flex gap-2">
          <Button size="md" onClick={() => void createAll()}>
            샘플 파일 3개 만들기
          </Button>
          {created[0] && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void exportService.revealInFolder(created[0].path)}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              폴더 열기
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-[12px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {created.length > 0 && (
          <ul className="flex flex-col gap-2">
            {created.map((row) => (
              <li
                key={row.sample.id}
                draggable={canDrag}
                onDragStart={(e) => handleDragStart(e, row)}
                className={cn(
                  "flex items-start gap-2 rounded-xl border border-border bg-surface-0 p-3",
                  canDrag && "cursor-grab active:cursor-grabbing hover:bg-surface-2",
                  row.outcome === "dragging" && "opacity-60",
                )}
              >
                {canDrag && (
                  <GripVertical
                    className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
                    aria-hidden
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-text-primary">
                    {row.sample.label}
                  </span>
                  <span className="text-[12px] text-text-secondary">{row.sample.note}</span>
                  <span className="truncate text-[11px] text-text-secondary" title={row.path}>
                    {row.path}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] font-semibold",
                      row.outcome === "dropped" && "text-brand-sky",
                      row.outcome === "failed" && "text-brand-coral",
                      (row.outcome === "idle" ||
                        row.outcome === "dragging" ||
                        row.outcome === "cancelled") &&
                        "text-text-secondary",
                    )}
                  >
                    상태: {row.outcome}
                  </span>
                </div>
                <button
                  type="button"
                  draggable={false}
                  onClick={() => void copyText(row.path)}
                  className="shrink-0 rounded px-2 py-1 text-[12px] text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                >
                  경로 복사
                </button>
              </li>
            ))}
          </ul>
        )}

        {log.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-text-secondary">
              로그
            </h2>
            <ul className="flex max-h-[220px] flex-col gap-0.5 overflow-auto rounded-lg bg-surface-0 p-3">
              {log.map((line, i) => (
                <li key={i} className="font-mono text-[11px] text-text-secondary">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
