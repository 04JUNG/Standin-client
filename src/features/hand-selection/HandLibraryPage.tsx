import { useFeatureView, useFeatureFailure } from "@/features/analytics/featureJourney";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useInstallationStore } from "@/features/installation/installationStore";
import { getHandCatalog, handKeys } from "./api";
import { HandThumbnail } from "./HandThumbnail";

export function HandLibraryPage() {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const catalog = useQuery({
    queryKey: handKeys.catalog(owner),
    queryFn: ({ signal }) => getHandCatalog(signal),
    retry: false,
  });
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  useFeatureFailure("hand_library", catalog.error);
  useFeatureView("hand_library", !!catalog.data, "exposure");
  useFeatureView("hand_library", !!catalog.data, "open");
  const all = catalog.data?.categories.flatMap((c) => c.presets) ?? [];
  const selected =
    catalog.data?.categories.find((c) => c.id === category) ?? catalog.data?.categories[0];
  const items = (query.trim() ? all : (selected?.presets ?? [])).filter((p) =>
    `${p.label} ${p.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <AppShell title="손 라이브러리">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          {all.length ? `${all.length}종 · ` : ""}좌우는 인물 자신의 기준입니다. 포즈를 고른 뒤
          ‘저장할 포즈 확인’ 화면에서 손 모양을 선택할 수 있어요.
        </p>
        {catalog.isPending && <p role="status">손 목록을 불러오는 중…</p>}
        {catalog.isError && (
          <div role="alert">
            손 목록을 불러오지 못했습니다.{" "}
            <Button onClick={() => void catalog.refetch()}>다시 시도</Button>
          </div>
        )}
        {catalog.data && (
          <>
            <input
              aria-label="손 모양 검색"
              placeholder="이름이나 설명으로 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-lg border border-border bg-surface-0 p-3"
            />
            <div className="flex flex-wrap gap-2">
              {catalog.data.categories.map((c) => (
                <Button
                  key={c.id}
                  variant={selected?.id === c.id ? "primary" : "secondary"}
                  onClick={() => {
                    setCategory(c.id);
                    setQuery("");
                  }}
                >
                  {c.label}
                </Button>
              ))}
            </div>
            {!items.length && <p>조건에 맞는 손 모양이 없습니다.</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <article key={p.id} className="rounded-xl border border-border bg-surface-0 p-3">
                  <h2 className="text-sm font-semibold">{p.label}</h2>
                  <p className="text-xs text-text-secondary">{p.description}</p>
                  <div className="mt-2 flex justify-around">
                    {(["left", "right"] as const).map((side) => (
                      <div key={side} className="text-center text-xs">
                        <HandThumbnail
                          preset={p}
                          side={side}
                          librarySha={catalog.data!.library_sha256}
                          large
                        />
                        <p>{side === "left" ? "왼손" : "오른손"}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
