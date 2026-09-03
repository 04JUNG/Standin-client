import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type { RefineOutcome, RefineService } from "./refine.contract";
import { loadThumbnail } from "./thumbnails";

type BffRefineResponse = {
  jobId: string;
  personIndex: number;
  candidateId: string;
  refined: boolean;
  reasonCode: string;
  adjustedLimbs: string[];
  exportUrl: string;
  /** 미리보기 PNG의 상대 경로. 서버가 그림을 보관하지 못했으면 null이다. */
  thumbnailUrl?: string | null;
};

export const refineHttp: RefineService = {
  async refineSelection({ jobId, personIndex, candidateId }): Promise<RefineOutcome> {
    const res = await apiFetch<BffRefineResponse>(endpoints.analysis.refine(jobId, personIndex), {
      method: "POST",
      body: { candidateId },
      auth: false,
    });
    return {
      jobId: res.jobId,
      personIndex: res.personIndex,
      candidateId: res.candidateId,
      refined: res.refined === true,
      reasonCode: res.reasonCode,
      adjustedLimbs: res.adjustedLimbs ?? [],
      exportUrl: res.exportUrl,
      // 후보 썸네일과 같은 형태로 맞춰 둔다. 화면이 "어느 쪽 그림인지"를 몰라도 되게
      // 하려면 폴백 대상과 타입이 같아야 한다.
      previewUrl: await loadThumbnail(res.thumbnailUrl),
    };
  },
};
