import { afterEach, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { readOutputScope, saveOutputScope } from "./outputScope";

vi.mock("@/shared/lib/env", () => ({
  env: { apiBaseUrl: "http://localhost:8080", useMockPoseApi: false, isProduction: false },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  __resetApiClient();
});

it("sends an object JSON body with installation authentication over the real HTTP adapter", async () => {
  const expected = {
    ...readOutputScope(undefined),
    selection: "half",
    resolved: "half",
    resolutionSource: "user",
  };
  setInstallationCredentials({ installationId: "inst_test", deviceToken: "test-token" });
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ personIndex: 2, outputScope: expected })),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await saveOutputScope("job_123", 2, "half", readOutputScope(undefined))).toEqual(expected);
  const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://localhost:8080/v1/analysis/jobs/job_123/people/2/output-scope");
  expect(JSON.parse(options.body as string)).toEqual({ selection: "half" });
  expect(options.headers).toMatchObject({
    "X-Installation-Id": "inst_test",
    "X-Device-Token": "test-token",
  });
  expect(options.method).toBe("PUT");
});

it("rejects mismatched people and malformed server replies instead of pretending it saved", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ personIndex: 9, outputScope: readOutputScope(undefined) })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ personIndex: 2, outputScope: {} })));
  vi.stubGlobal("fetch", fetchMock);
  await expect(saveOutputScope("job_123", 2, "head", readOutputScope(undefined))).rejects.toThrow();
  await expect(saveOutputScope("job_123", 2, "head", readOutputScope(undefined))).rejects.toThrow();
});
