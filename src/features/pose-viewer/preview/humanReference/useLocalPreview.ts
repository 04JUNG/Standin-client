import { useEffect, useState } from "react";
import { loadReferenceBvh } from "../../api/humanReference";
import { loadApprovedModel, type PreviewGender } from "./approvedModels";
import { referenceSurface } from "./surface";

type Model = ReturnType<typeof referenceSurface>;
const sources = new Map<string, string>();
let sourceBytes = 0;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
async function sourceText(
  owner: string,
  url: string,
  source: string | undefined,
  scope: string,
  owned: boolean,
  signal: AbortSignal,
) {
  const key = JSON.stringify([owner, url, source, scope, owned]);
  const cached = sources.get(key);
  if (cached) {
    signal.throwIfAborted();
    return cached;
  }
  const text = await loadReferenceBvh(url, source, scope, signal, owned);
  if (!sources.has(key)) {
    sources.set(key, text);
    sourceBytes += text.length * 2;
  }
  while (sources.size > 24 || sourceBytes > MAX_SOURCE_BYTES) {
    const oldest = sources.keys().next().value!;
    sourceBytes -= sources.get(oldest)!.length * 2;
    sources.delete(oldest);
  }
  return text;
}

/** Cached BVH plus bundled model and authoring correctives; no server pose solve. */
export function useLocalPreview({
  owner,
  binding,
  url,
  source,
  scope,
  gender,
}: {
  owner: string;
  binding: string;
  url?: string;
  source?: string;
  scope: string;
  gender: PreviewGender;
}) {
  const [loaded, setLoaded] = useState<{ binding: string; model?: Model }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoaded(undefined);
    if (!owner || !url) return;
    const controller = new AbortController();
    const { signal } = controller;
    let model: Model | undefined;
    const timer = setTimeout(() => {
      controller.abort();
      setLoaded({ binding });
    }, 10_000);
    void Promise.all([
      loadApprovedModel(gender, scope, signal),
      sourceText(owner, url, source, scope, url.startsWith("/v1/analysis/jobs/"), signal),
    ])
      .then(([asset, bvh]) => {
        signal.throwIfAborted();
        model = referenceSurface(asset.template, bvh, asset.skin, asset.corrections);
        setLoaded({ binding, model });
      })
      .catch(() => {
        if (!signal.aborted) setLoaded({ binding });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
      model?.release();
    };
  }, [owner, binding, url, source, scope, gender, attempt]);
  const current = owner && url && loaded?.binding === binding ? loaded : undefined;
  return {
    model: current?.model,
    loading: !!(owner && url && !current),
    failed: !!current && !current.model,
    retry: () => {
      setLoaded(undefined);
      setAttempt((n) => n + 1);
    },
  };
}
