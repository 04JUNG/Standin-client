import { useEffect, useState } from "react";
import { apiFetchBlob } from "@/shared/api/client";

/**
 * 인증이 필요한 이미지 경로를 화면에 붙일 수 있는 URL로 바꾼다.
 *
 * 서버가 주는 썸네일 경로는 상대 경로이고 인증 헤더를 요구하므로 `<img src>`에 그대로
 * 넣을 수 없다. blob으로 받아 object URL을 만든다(base64 data URL보다 메모리를 덜 쓴다).
 *
 * 썸네일 하나가 없다고 목록이 깨지면 안 되므로 실패는 삼키고 null을 돌려준다 —
 * 화면은 플레이스홀더를 그린다.
 */
export function useAuthedImage(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    const controller = new AbortController();

    void apiFetchBlob(path, { auth: false, signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUrl(null);
      });

    return () => {
      controller.abort();
      // 만들지 않았으면 해제할 것도 없다. 만들었다면 반드시 해제한다 —
      // 목록을 오래 스크롤하면 해제하지 않은 object URL이 그대로 쌓인다.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return url;
}
