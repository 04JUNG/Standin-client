export function AcquisitionConsentFields({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-xl border border-border p-4 text-sm text-text-primary"
    >
      <legend className="px-1 font-bold">설치별 광고 유입·사용 이력 연결 (선택)</legend>
      <p className="leading-6 text-text-secondary">
        어떤 광고가 실제 이용에 도움이 되는지 확인하기 위해, 광고 전용 설치 파일이나 앱 열기 링크의
        구분값과 이 설치의 식별자·동의 확인 시각을 연결합니다. 연결 후 활성 이용·분석 성공·후보
        선택·저장 완료 여부를 최대 90일간 집계합니다. 원고 내용은 광고 측정에 사용하지 않으며 앱
        이용 기록을 Google·Meta에 보내지 않습니다.
      </p>
      <p className="leading-6 text-text-secondary">
        동의하면 새 등록 시 설치 파일의 소재를, 일반 파일은 등록 후 24시간 이내에 받은 광고 링크를
        추가 팝업 없이 연결합니다. 선택은 이 기기에 최대 90일 저장됩니다. 거절해도 기본 기능을
        이용할 수 있습니다. 설정에서 철회하면 광고 구분값은 삭제하며 재연결 방지용 동의 확인 시각은
        설치 기록 삭제까지 남습니다. 운영·문의: Standin · standin.asm@gmail.com.
      </p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        [선택] 위 목적·항목·기간에 따른 설치별 광고 유입·사용 이력 연결에 동의합니다.
      </label>
    </fieldset>
  );
}
