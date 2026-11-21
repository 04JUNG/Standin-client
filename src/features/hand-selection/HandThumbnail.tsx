import leftExample from "./assets/source-hand-example-left.png";
import rightExample from "./assets/source-hand-example-right.png";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Loader2 } from "lucide-react";
import { useInstallationStore } from "@/features/installation/installationStore";
import { handThumbnailKeys, loadHandThumbnail } from "./thumbnail";
import type { HandPreset, Side } from "./contract";

export function HandThumbnail({
  preset,
  side,
  librarySha,
  large = false,
}: {
  preset: HandPreset;
  side: Side;
  librarySha: string;
  large?: boolean;
}) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const path = preset.thumbnails?.[side];
  const image = useQuery({
    queryKey: handThumbnailKeys.image(owner, librarySha, preset.id, side),
    queryFn: ({ signal }) => loadHandThumbnail(preset.id, side, librarySha, signal),
    enabled: !!path,
    staleTime: 3_600_000,
    gcTime: 3_600_000,
    retry: false,
  });
  const size = large ? "h-24 w-full" : "h-12 w-12 shrink-0";
  if (path && image.isPending)
    return (
      <span
        className={`${size} flex items-center justify-center rounded bg-surface-2`}
        aria-label="손 이미지 불러오는 중"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden />
      </span>
    );
  const unavailable = !path || image.isError || !image.data || failedAt === image.dataUpdatedAt;
  if (unavailable && preset.id === "source_pose")
    return (
      <span className={`${size} relative overflow-hidden rounded bg-surface-2`}>
        <img
          src={side === "left" ? leftExample : rightExample}
          alt=""
          className="h-full w-full object-contain"
        />
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/75 px-1 text-[10px] text-white">
          예시
        </span>
      </span>
    );
  if (unavailable)
    return (
      <span
        className={`${size} flex flex-col items-center justify-center gap-1 rounded bg-surface-2 text-[10px] text-text-secondary`}
        role="img"
        aria-label="손 이미지 없음"
      >
        <ImageOff className="h-5 w-5" aria-hidden />
        <span>이미지 없음</span>
      </span>
    );
  return (
    <img
      src={image.data}
      alt=""
      data-hand-thumbnail={preset.id}
      data-hand-side={side}
      onError={() => setFailedAt(image.dataUpdatedAt)}
      className={`${size} rounded bg-surface-2 object-contain`}
    />
  );
}
