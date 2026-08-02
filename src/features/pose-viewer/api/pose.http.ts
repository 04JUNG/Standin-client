import { apiFetch, apiFetchBlob } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type {
  AnalysisResult,
  MatchLevel,
  PersonResult,
  PoseCandidate,
  PoseResultService,
} from "./pose.contract";

/** BFF의 비동기 분석 Job 계약. */
type AnalysisJobStatus = "queued" | "running" | "completed" | "failed";

type CreateJobResponse = {
  jobId: string;
  status: AnalysisJobStatus;
  createdAt: string;
};

type JobStatusResponse = CreateJobResponse & {
  updatedAt: string;
  error: string | null;
};

type BffCandidate = {
  id: string;
  poseId: string;
  rank: number;
  view: string;
  tags: string[];
  matchLevel: MatchLevel;
  bvhAvailable: boolean;
  thumbnailUrl?: string;
};

type BffAnalysisResult = {
  jobId: string;
  notes: string[];
  candidatesByPerson: Array<{
    personIndex: number;
    box: number[] | null;
    tags: Record<string, string>;
    candidates: BffCandidate[];
  }>;
};

const POLL_INTERVAL_MS = 750;
const JOB_TIMEOUT_MS = 3 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === "function") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function loadThumbnail(path: string | undefined): Promise<string> {
  if (!path) return "";
  try {
    return await blobToDataUrl(await apiFetchBlob(path, { auth: false }));
  } catch {
    // 썸네일 하나가 없어도 분석 후보와 BVH 저장은 계속 제공한다.
    return "";
  }
}

async function toPoseCandidate(
  raw: BffCandidate,
  jobId: string,
  personIndex: number,
): Promise<PoseCandidate> {
  const thumbnailUrl = await loadThumbnail(raw.thumbnailUrl);
  return {
    id: raw.id,
    poseId: raw.poseId,
    rank: raw.rank,
    title: `포즈 ${raw.id}`,
    tags: raw.tags,
    matchLevel: raw.matchLevel,
    thumbnailUrl,
    previewImages: thumbnailUrl ? [{ view: raw.view, url: thumbnailUrl }] : [],
    modelUrl: null,
    bvhAvailable: raw.bvhAvailable,
    bvhUrl: raw.bvhAvailable
      ? endpoints.poseCandidates.export(raw.poseId, jobId, personIndex, raw.id)
      : undefined,
  };
}

async function toAnalysisResult(raw: BffAnalysisResult): Promise<AnalysisResult> {
  const people: PersonResult[] = await Promise.all(
    raw.candidatesByPerson.map(async (person) => ({
      index: person.personIndex,
      candidates: await Promise.all(
        person.candidates.map((candidate) =>
          toPoseCandidate(candidate, raw.jobId, person.personIndex),
        ),
      ),
    })),
  );

  if (people.length === 0) {
    throw new Error("이미지에서 인물을 찾지 못했습니다.");
  }

  return { jobId: raw.jobId, people };
}

async function waitForResult(jobId: string): Promise<BffAnalysisResult> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const job = await apiFetch<JobStatusResponse>(endpoints.analysis.job(jobId), { auth: false });

    if (job.status === "completed") {
      return apiFetch<BffAnalysisResult>(endpoints.analysis.result(jobId), { auth: false });
    }
    if (job.status === "failed") {
      throw new Error("포즈 분석에 실패했습니다. 다른 이미지로 다시 시도해 주세요.");
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("분석 시간이 너무 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.");
}

export const poseHttp: PoseResultService = {
  async analyze({ file, source, width, height }): Promise<AnalysisResult> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("source", source);
    formData.append("width", String(width));
    formData.append("height", String(height));

    const job = await apiFetch<CreateJobResponse>(endpoints.analysis.jobs, {
      method: "POST",
      body: formData,
      auth: false,
    });
    const result = await waitForResult(job.jobId);
    return await toAnalysisResult(result);
  },
};
