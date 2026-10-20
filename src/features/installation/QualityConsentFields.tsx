import type { QualityChoices } from "./qualityConsentStore";
import { env } from "@/shared/lib/env";
import { openExternal } from "@/shared/lib/openExternal";

export function QualityConsentFields({
  value,
  onChange,
  disabled = false,
}: {
  value: QualityChoices;
  onChange(value: QualityChoices): void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-xl border border-border p-4 text-sm text-text-primary"
    >
      <legend className="px-1 font-bold">품질 검토 참여 (선택)</legend>
      <p className="leading-6 text-text-secondary">
        Standin 팀이 분석 정확도·사용성 평가와 오류 확인을 위해 동의 후 제출한 이미지·캡처,
        설치·작업 ID, 관절·포즈 후보, 선택·보정 결과, 피드백·상세 사용 기록과 앱·OS 정보를
        검토합니다. 원본은 업로드 후 최대 90일, 연결된 평가정보는 수집 후 최대 365일 또는 철회 시점
        중 이른 때까지 보관합니다.
      </p>
      <p className="leading-6 text-text-secondary">
        두 항목에 모두 동의한 경우에만 담당자가 열람·복제·분석할 수 있습니다. 자체 AI
        학습·미세조정과 홍보에는 사용하지 않습니다. 거절하거나 설정에서 철회해도 기본
        분석·내보내기를 이용할 수 있습니다.
      </p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.personalData}
          onChange={(e) => onChange({ ...value, personalData: e.target.checked })}
        />
        [선택] 위 목적·항목·기간에 따른 개인정보 수집·이용에 동의합니다.
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.contentLicense}
          onChange={(e) => onChange({ ...value, contentLicense: e.target.checked })}
        />
        [선택] 제가 권한을 가진 입력 원고를 위 품질 검토 범위에서 열람·복제·분석하도록 허락합니다.
      </label>
      <p className="text-xs leading-5 text-text-secondary">
        철회 문의: standin.asm@gmail.com · 최소 동의 증빙(문서 버전·시각·식별정보)은 동의 종료 후
        최대 1년 별도 보관합니다.
      </p>
      <button
        type="button"
        className="underline underline-offset-2"
        onClick={() => void openExternal(`${env.webBaseUrl}/legal/privacy/`)}
      >
        개인정보처리방침 보기
      </button>
    </fieldset>
  );
}
