import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { QualityConsentFields } from "./QualityConsentFields";
import { useQualityConsentStore, type QualityChoices } from "./qualityConsentStore";

export function QualityConsentSection() {
  const { consent, loaded, saving, pendingChoices, error, refresh, save } =
    useQualityConsentStore();
  const [choices, setChoices] = useState<QualityChoices>(pendingChoices ?? consent);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setChoices(pendingChoices ?? consent);
  }, [consent, pendingChoices]);
  async function submit() {
    setSaved(false);
    if (await save(choices)) setSaved(true);
  }
  return (
    <section className="space-y-3">
      <QualityConsentFields
        value={choices}
        disabled={!loaded || saving}
        onChange={(value) => {
          setChoices(value);
          setSaved(false);
        }}
      />
      <p className="text-xs leading-5 text-text-secondary">
        한 항목이라도 해제하고 저장하면 품질 검토를 철회합니다. 기존 품질 전용 기록과 열람 권한을
        삭제합니다. 기본 분석용 원본·작업 결과는 기존 최대 90일 한도 안에서 남으며, 아래 전체 데이터
        삭제로 함께 지울 수 있습니다. 다시 동의해도 이전 작업은 품질 검토에 포함하지 않습니다.
      </p>
      {error && (
        <p role="alert" className="text-sm text-brand-coral">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-text-secondary">
          품질 검토 설정을 저장했습니다.
        </p>
      )}
      <Button
        variant="secondary"
        disabled={saving}
        onClick={() => void (loaded ? submit() : refresh())}
      >
        {saving ? "저장 중…" : loaded ? "품질 검토 설정 저장" : "동의 상태 다시 확인"}
      </Button>
    </section>
  );
}
