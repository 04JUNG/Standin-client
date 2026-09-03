import { apiFetchBlob } from "@/shared/api/client";

/**
 * 인증이 필요한 썸네일 경로를 `<img src>`에 바로 넣을 수 있는 값으로 바꾼다.
 *
 * BFF의 썸네일 경로는 상대 경로이고 installation 헤더를 요구하므로 그대로 붙일 수 없다.
 * 후보 썸네일과 확인 화면 미리보기가 같은 형태여야 화면이 둘을 구분하지 않고 쓴다.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === "function") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 썸네일 하나를 받아 온다. 실패하면 빈 문자열 — 그림이 없다고 흐름을 멈추지 않는다.
 *
 * signal이 있으면 취소는 삼키지 않고 상위 요청까지 올린다. 화면을 떠났거나 deadline이
 * 지난 것을 "썸네일 없음"으로 바꿔치기하면 취소가 취소로 안 보인다.
 */
export async function loadThumbnail(
  path: string | null | undefined,
  signal?: AbortSignal,
): Promise<string> {
  if (!path) return "";
  try {
    return await blobToDataUrl(await apiFetchBlob(path, { auth: false, signal }));
  } catch (error) {
    if (signal?.aborted) throw error;
    return "";
  }
}
