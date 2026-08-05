import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type { RefineOutcome, RefineService } from "./refine.contract";

type BffRefineResponse = {
  jobId: string;
  personIndex: number;
  candidateId: string;
  refined: boolean;
  reasonCode: string;
  adjustedLimbs: string[];
  exportUrl: string;
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
    };
  },
};
