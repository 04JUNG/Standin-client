import { useEffect, useState } from "react";
import type { PersonBox } from "../api/pose.contract";

export type ImageSize = { width: number; height: number };

/** 원본 크기. 이미지가 바뀔 때만 다시 읽는다. 실패하면 null(자르지 않는다). */
export function useImageSize(url?: string) {
  const [size, setSize] = useState<ImageSize | null>(null);
  useEffect(() => {
    setSize(null);
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive && img.naturalWidth > 0 && img.naturalHeight > 0)
        setSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return size;
}

/**
 * 상자를 원본 안으로 넣고 조금 넓힌다. 상자가 원본과 맞지 않으면(다른 좌표계로 보이면)
 * 자르지 않는다 — 엉뚱한 곳을 "이 인물"이라고 보여주는 것보다 낫다.
 */
export function cropRect(box: PersonBox | null | undefined, size: ImageSize | null) {
  if (!box || !size) return null;
  const [x1, y1, x2, y2] = box;
  if (x2 > size.width * 1.02 || y2 > size.height * 1.02) return null;
  const pad = Math.max(x2 - x1, y2 - y1) * 0.04;
  const x = Math.max(0, x1 - pad);
  const y = Math.max(0, y1 - pad);
  return {
    x,
    y,
    width: Math.min(size.width, x2 + pad) - x,
    height: Math.min(size.height, y2 + pad) - y,
  };
}
