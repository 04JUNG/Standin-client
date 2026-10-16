import { useState } from "react";
import type { PoseCandidate } from "@/features/pose-viewer/api/pose.contract";
import { PoseCandidateCard } from "@/features/pose-viewer/components/PoseCandidateCard";

/** Server rank stays intact; alternate ids are actual library assets, never a CSS reflection. */
export function SemanticCandidates({
  candidates,
  selected,
  onSelect,
}: {
  candidates: PoseCandidate[];
  selected?: string;
  onSelect(id: string): void;
}) {
  const [variantByFamily, setVariants] = useState<Record<string, string>>({});
  const groups = new Map<string, PoseCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.semantic?.familyId ?? candidate.id;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return (
    <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {[...groups].map(([family, variants]) => {
        const chosen = variants.find((v) => v.id === selected);
        const active =
          chosen ?? variants.find((v) => v.id === variantByFamily[family]) ?? variants[0]!;
        return (
          <div key={family} className="flex min-w-0 flex-col gap-2">
            <PoseCandidateCard
              candidate={active}
              isSelected={active.id === selected}
              onSelect={() => onSelect(active.id)}
            />
            {variants.length > 1 && (
              <label className="flex flex-col gap-1 text-[12px] text-text-secondary">
                원본·미러 후보
                <select
                  aria-label={`${active.rank}번 후보 방향`}
                  className="rounded border border-border bg-surface-0 p-2 text-text-primary"
                  value={active.id}
                  onChange={(e) => {
                    setVariants((s) => ({ ...s, [family]: e.target.value }));
                    if (chosen) onSelect(e.target.value);
                  }}
                >
                  {variants.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {i === 0 ? "검색 대표 포즈" : `다른 방향 ${i}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
