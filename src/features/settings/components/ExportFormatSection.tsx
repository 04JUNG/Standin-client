import { Info } from "lucide-react";
import { useExportStore, type ExportFormat } from "@/features/export/store/exportStore";

/**
 * 설정의 기본 저장 포맷 섹션.
 *
 * 저장은 후보를 고르면 자동으로 일어나므로(ADR-009) 저장할 때마다 포맷을 묻지 않는다.
 * 저장 폴더와 같은 자리에서 한 번 정한다. 한 번만 다른 포맷이 필요하면 저장 완료 화면의
 * "다른 포맷으로도 저장"을 쓴다 — 그건 이 값을 바꾸지 않는다.
 *
 * FBX 실제 제공 여부는 서버가 정한다(`capabilities.fbxExport`). 여기서 FBX를 골라 두어도
 * 서버가 못 주는 배포에서는 BVH로 저장되고, 저장 화면이 그 사실을 알린다.
 */
const OPTIONS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  {
    value: "fbx",
    label: "FBX",
    hint: "리깅된 3D 소재로 저장합니다. 클립스튜디오 3D 소재로 바로 등록할 수 있습니다.",
  },
  {
    value: "bvh",
    label: "BVH",
    hint: "모션 데이터만 저장합니다. 클립스튜디오 3.1.0 이상에서만 열 수 있습니다.",
  },
];

export function ExportFormatSection() {
  const format = useExportStore((s) => s.format);
  const setFormat = useExportStore((s) => s.setFormat);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-bold text-text-primary">기본 저장 포맷</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          포즈를 어떤 파일로 저장할지 정합니다. 저장할 때마다 묻지 않습니다.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="기본 저장 포맷"
        className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-4"
      >
        {OPTIONS.map((option) => {
          const selected = format === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-surface-1 focus-within:ring-2 focus-within:ring-brand-sky ${
                selected ? "border-brand-sky bg-brand-sky/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="export-format"
                value={option.value}
                checked={selected}
                onChange={() => setFormat(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-sky"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-text-primary">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[12px] text-text-secondary">{option.hint}</span>
              </span>
            </label>
          );
        })}

        <p className="flex items-start gap-1.5 pt-1 text-[12px] text-text-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          FBX를 아직 제공하지 않는 서버에 연결되면 BVH로 저장되고, 저장 화면에서 알려 드립니다.
        </p>
      </div>
    </section>
  );
}
