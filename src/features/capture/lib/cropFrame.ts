/** 선택 영역(프레임의 물리 픽셀 기준). */
export type CropRect = { x: number; y: number; width: number; height: number };

/** 화면에 표시된 선택 사각형(CSS px). */
export type SelectionRect = { x: number; y: number; w: number; h: number };
export type Size = { width: number; height: number };

/**
 * 오버레이(CSS px)에서 그린 선택 영역을 프레임의 물리 픽셀 좌표로 변환한다.
 * 프레임이 오버레이보다 크거나 작아도 비율로 매핑한다(고배율/스케일 대응, docs/07 §12).
 */
export function scaleSelectionToFrame(sel: SelectionRect, container: Size, frame: Size): CropRect {
  const scaleX = frame.width / container.width;
  const scaleY = frame.height / container.height;
  return {
    x: sel.x * scaleX,
    y: sel.y * scaleY,
    width: sel.w * scaleX,
    height: sel.h * scaleY,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("프레임 이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 프리즈 프레임 data URL에서 선택 영역을 잘라 PNG File을 만든다.
 * 크롭은 프레임의 물리 픽셀 좌표로 수행한다.
 */
export async function cropFrameToFile(
  dataUrl: string,
  rect: CropRect,
): Promise<{ file: File; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context 없음");

  ctx.drawImage(img, Math.round(rect.x), Math.round(rect.y), width, height, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("크롭 실패"))), "image/png");
  });

  const file = new File([blob], `standin_capture_${timestamp()}.png`, { type: "image/png" });
  return { file, width, height };
}
