import { loadHumanTemplate } from "../api/humanReference";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import { ExpandablePose } from "../interactive/InteractivePose";
import { loadPreparedSource, sourceSurface } from "./sourcePreview";
import type { SourcePreview } from "./contract";
export function SourcePosePreview({ asset, onFrame }: { asset: SourcePreview; onFrame(): void }) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const query = useQuery({
    queryKey: ["candidate-source-preview", owner, asset],
    queryFn: ({ signal }) => loadPreparedSource(asset, signal),
    enabled: !!owner,
    staleTime: 600_000,
    gcTime: 600_000,
    retry: false,
  });
  const template = useQuery({
    queryKey: ["candidate-source-display-template", owner],
    queryFn: ({ signal }) => loadHumanTemplate("full", signal),
    enabled: !!owner,
    staleTime: Infinity,
    retry: false,
  });
  const [surface, setSurface] = useState<ReturnType<typeof sourceSurface>>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setSurface(undefined);
    if (!query.data || !template.data) return;
    try {
      const result = sourceSurface(template.data, query.data.text, asset.sha256, asset.camera);
      setSurface(result);
      return () => result.dispose();
    } catch {
      setFailed(true);
    }
  }, [query.data, template.data, asset.sha256, asset.camera]);
  if (failed || query.isError || template.isError)
    return (
      <div role="alert" className="p-3 text-center text-xs">
        3D를 표시하지 못했어요.{" "}
        <button
          className="underline"
          onClick={() => {
            void query.refetch();
            void template.refetch();
          }}
        >
          다시 시도
        </button>
      </div>
    );
  if (!surface || query.data?.sha256 !== asset.sha256)
    return (
      <p role="status" className="p-3 text-xs">
        포즈 불러오는 중
      </p>
    );
  return (
    <ExpandablePose
      surface={surface}
      viewKey={asset.contextHash}
      showControls={false}
      onFrame={onFrame}
    />
  );
}
