import { describe, expect, it } from "vitest";
import { appRouteForBarPath, barRouteForAppPath } from "./modeRoutes";

const JOB = "job-1";

describe("appRouteForBarPath", () => {
  it("후보·저장 단계를 같은 job의 앱 화면으로 연다", () => {
    expect(appRouteForBarPath("/bar/candidates", { jobId: JOB, hasDraft: true })).toBe(
      `/app/jobs/${JOB}`,
    );
    expect(appRouteForBarPath("/bar/review", { jobId: JOB, hasDraft: true })).toBe(
      `/app/jobs/${JOB}/review`,
    );
    expect(appRouteForBarPath("/bar/save", { jobId: JOB, hasDraft: true })).toBe(
      `/app/jobs/${JOB}/save`,
    );
  });

  it("분석 전 초안만 있으면 미리보기로 연다", () => {
    expect(appRouteForBarPath("/bar/progress", { jobId: null, hasDraft: true })).toBe(
      "/app/preview",
    );
    expect(appRouteForBarPath("/bar/actions", { jobId: null, hasDraft: true })).toBe(
      "/app/preview",
    );
  });

  it("이어갈 것이 없으면 홈으로 연다", () => {
    expect(appRouteForBarPath("/bar", { jobId: null, hasDraft: false })).toBe("/app/home");
    expect(appRouteForBarPath("/bar/actions", { jobId: null, hasDraft: false })).toBe("/app/home");
    // job이 사라진 상태로 저장 화면이 남아 있어도 잘못된 URL을 만들지 않는다.
    expect(appRouteForBarPath("/bar/save", { jobId: null, hasDraft: false })).toBe("/app/home");
  });
});

describe("barRouteForAppPath", () => {
  it("후보·저장 단계를 같은 단계의 바로 접는다", () => {
    expect(barRouteForAppPath(`/app/jobs/${JOB}`)).toBe("/bar/candidates");
    expect(barRouteForAppPath(`/app/jobs/${JOB}/review`)).toBe("/bar/review");
    expect(barRouteForAppPath(`/app/jobs/${JOB}/save`)).toBe("/bar/save");
  });

  it("미리보기는 바의 기본 동작 화면으로 접는다", () => {
    expect(barRouteForAppPath("/app/preview")).toBe("/bar/actions");
    expect(barRouteForAppPath("/app/preview", "/bar/actions")).toBe("/bar/actions");
  });

  it("대응 단계가 없으면 idle로 간다", () => {
    expect(barRouteForAppPath("/app/home")).toBe("/bar");
    expect(barRouteForAppPath("/app/settings")).toBe("/bar");
    expect(barRouteForAppPath("/app/home", "/bar/actions")).toBe("/bar/actions");
  });
});

describe("왕복", () => {
  it("바 → 앱 → 바가 같은 단계로 돌아온다", () => {
    for (const barPath of ["/bar/candidates", "/bar/review", "/bar/save"]) {
      const appPath = appRouteForBarPath(barPath, { jobId: JOB, hasDraft: true });
      expect(barRouteForAppPath(appPath), barPath).toBe(barPath);
    }
  });

  it("앱 → 바 → 앱이 같은 단계로 돌아온다", () => {
    for (const appPath of [
      `/app/jobs/${JOB}`,
      `/app/jobs/${JOB}/review`,
      `/app/jobs/${JOB}/save`,
      "/app/preview",
    ]) {
      const barPath = barRouteForAppPath(appPath);
      expect(appRouteForBarPath(barPath, { jobId: JOB, hasDraft: true }), appPath).toBe(appPath);
    }
  });
});
