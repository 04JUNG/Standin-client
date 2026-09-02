import { ExportError, type ExportService, type SaveCandidateInput, type SavedFile } from "./export.contract";
import { buildZip } from "../lib/zip";

/**
 * 브라우저(Vite) 개발용 어댑터.
 *
 * File System Access API(Chromium 계열)를 지원하면 사용자가 고른 실제 폴더에 파일을
 * 각각 별도로 써서 진짜 여러 파일로 저장한다 — Tauri 없이도 개별 저장 가능.
 * 미지원 브라우저(Firefox 등)에서는 <a download>로 폴백하되, 파일이 2개 이상이면
 * zip 하나로 묶는다(브라우저가 연속 자동 다운로드를 두 번째 파일부터 조용히 차단하기 때문).
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function supportsFsAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

// 세션 동안 재사용하는 실제 폴더 핸들. 새로고침하면 다시 선택해야 한다(브라우저 보안 모델).
let cachedDirHandle: FileSystemDirectoryHandle | null = null;

async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  try {
    const handle = await window.showDirectoryPicker({ id: "standin-export", mode: "readwrite" });
    cachedDirHandle = handle;
    return handle;
  } catch (err) {
    if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError")) {
      throw new ExportError("CANCELLED", "폴더 선택이 취소되었습니다.");
    }
    throw new ExportError("UNSUPPORTED", "폴더에 접근하지 못했습니다.");
  }
}

/**
 * 바이트를 자기 소유의 ArrayBuffer로 복사한다.
 *
 * TS 5.7부터 `Uint8Array`가 backing buffer 종류를 제네릭으로 들고 다녀서, SharedArrayBuffer
 * 기반일 수 있는 뷰는 Blob·FileSystemWritable이 그대로 받지 않는다. 캐스팅으로 덮으면
 * 런타임에 진짜 SharedArrayBuffer가 들어왔을 때 조용히 깨진다.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function writeFile(dir: FileSystemDirectoryHandle, fileName: string, content: Uint8Array): Promise<void> {
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(toArrayBuffer(content));
  await writable.close();
}

function triggerBlobDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const MOCK_DEFAULT_FOLDER = "C:\\Users\\me\\Downloads";

// File System Access 미지원 브라우저에서만 쓰는 가짜 폴더 순환 목록.
const MOCK_ALT_FOLDERS = ["C:\\Users\\me\\Downloads", "C:\\Users\\me\\Documents", "C:\\Users\\me\\Desktop"];

export const exportMock: ExportService = {
  async getDefaultFolder(): Promise<string> {
    await delay(150);
    return cachedDirHandle?.name ?? MOCK_DEFAULT_FOLDER;
  },

  async chooseFolder(currentFolder?: string): Promise<string | null> {
    if (supportsFsAccess()) {
      try {
        const dir = await pickDirectory();
        return dir.name;
      } catch (err) {
        if (err instanceof ExportError && err.code === "CANCELLED") return null;
        throw err;
      }
    }
    await delay(150);
    const currentIndex = MOCK_ALT_FOLDERS.indexOf(currentFolder ?? "");
    const next = MOCK_ALT_FOLDERS[(currentIndex + 1) % MOCK_ALT_FOLDERS.length];
    return next;
  },

  // 브라우저는 임의 경로의 존재를 확인할 수 없다. 가짜 폴더는 항상 있는 것으로 둔다.
  async folderExists(): Promise<boolean> {
    return true;
  },

  async saveCandidates(input: { folder: string; files: SaveCandidateInput[] }): Promise<SavedFile[]> {
    if (input.files.length === 0) return [];

    // 이미 폴더 핸들을 받아둔 경우에만 실제 폴더에 쓴다.
    //
    // 저장은 화면 진입과 함께 자동으로 일어나므로(ADR-009) 여기서 showDirectoryPicker를
    // 부를 수 없다 — 사용자 제스처가 없는 호출은 브라우저가 거부한다. 핸들은 사용자가
    // "다른 폴더에 저장"을 눌렀을 때 chooseFolder에서 받아 캐시된다.
    if (supportsFsAccess() && cachedDirHandle) {
      const dir = cachedDirHandle;
      const results: SavedFile[] = [];
      for (const file of input.files) {
        await writeFile(dir, file.fileName, file.content);
        results.push({ path: `${dir.name}\\${file.fileName}` });
      }
      console.info(`[export.mock] 실제 폴더(${dir.name})에 파일 ${input.files.length}개를 개별 저장`);
      return results;
    }

    // 폴백: 폴더 핸들이 없거나 File System Access 미지원 브라우저.
    await delay(500);
    if (input.files.length === 1) {
      const file = input.files[0];
      triggerBlobDownload(file.fileName, new Blob([toArrayBuffer(file.content)], { type: "application/octet-stream" }));
      return [{ path: `${input.folder}\\${file.fileName}` }];
    }
    const zipName = `standin_poses_${Date.now()}.zip`;
    const zip = buildZip(input.files.map((f) => ({ name: f.fileName, content: f.content })));
    triggerBlobDownload(zipName, zip);
    return [{ path: `${input.folder}\\${zipName} (안에 ${input.files.length}개 포함)` }];
  },

  async revealInFolder(path: string): Promise<void> {
    console.info(`[export.mock] 폴더 열기(가상): ${path}`);
  },
};
