import "fake-indexeddb/auto";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { gunzipSync, strFromU8 } from "fflate";
import { PersonalDeformLibrary } from "@/features/personal-body/PersonalDeformCards";
import { useLocalBodies, useLocalImport } from "@/features/personal-body/store";
import { setInstallationCredentials } from "@/shared/api/client";
import { createReplayPrivacyFilter } from "./privateDom";
import * as client from "./client";
import { startRecorder } from "./recorder";
import { queueItems, clearReplayQueue, persistWithdrawal } from "./queue";
import { safeStorage } from "@/shared/lib/safeStorage";
const secret = "PRIVATE_CHARACTER_NAME_20261103";
vi.mock("@/app/router", () => ({
  router: { state: { location: { pathname: "/app/models" } }, subscribe: () => () => {} },
}));
vi.mock("@/features/personal-body/api", () => ({
  localBodyApi: {
    supported: () => true,
    list: async () => [
      {
        localModelId: "00000000-0000-4000-8000-000000000001",
        name: "PRIVATE_CHARACTER_NAME_20261103",
        format: "cs3c",
        sourceHash: "a".repeat(64),
        version: 1,
      },
    ],
    preview: async () => new Uint8Array(),
    capabilities: async () => ({ available: true, formats: ["fbx", "cs3c"] }),
    progress: async () => () => {},
    rename: async () => {},
    remove: async () => {},
  },
}));
vi.mock("@/features/personal-body/LocalFbxPreview", () => ({
  LocalFbxPreview: ({ name }: { name: string }) => <canvas aria-label={`${name} preview`} />,
}));
afterEach(() => {
  client.stopReplay();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("filters initial snapshot, same-batch private mutations, and private focus/input metadata before any buffer", () => {
  const filter = createReplayPrivacyFilter();
  const snapshot = filter({
    type: 2,
    data: {
      node: {
        id: 1,
        type: 2,
        tagName: "div",
        attributes: {},
        childNodes: [
          {
            id: 2,
            type: 2,
            tagName: "button",
            attributes: { "data-replay-private": "", "aria-label": secret, title: secret },
            childNodes: [{ id: 3, type: 3, textContent: secret }],
          },
        ],
      },
    },
  });
  expect(JSON.stringify(snapshot)).not.toContain(secret);
  const changed = filter({
    type: 3,
    data: {
      source: 0,
      texts: [{ id: 3, value: secret }],
      attributes: [{ id: 2, attributes: { title: secret } }],
      adds: [{ parentId: 2, node: { id: 4, type: 3, textContent: secret } }],
    },
  });
  expect(JSON.stringify(changed)).not.toContain(secret);
  expect(filter({ type: 3, data: { source: 5, id: 2, text: secret } })).toBeUndefined();
  filter({
    type: 2,
    data: {
      node: {
        type: 2,
        id: 1,
        tagName: "div",
        attributes: {},
        childNodes: [
          {
            type: 2,
            id: 5,
            tagName: "div",
            attributes: {},
            childNodes: [{ type: 3, id: 6, textContent: "public" }],
          },
        ],
      },
    },
  });
  const newlyPrivate = filter({
    type: 3,
    data: {
      source: 0,
      texts: [{ id: 6, value: secret }],
      attributes: [{ id: 5, attributes: { "data-replay-private": "", "aria-label": secret } }],
      adds: [],
    },
  });
  expect(JSON.stringify(newlyPrivate)).not.toContain(secret);
});
it("actual product cards + rrweb recorder + sanitizer + queue and upload contain no personal names or local files", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("VITE_REPLAY_ENABLED", "true");
  vi.stubEnv("VITE_APP_ENV", "development");
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      if (init?.body) requests.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: String(_url).includes("/chunks/") ? 503 : 200 });
    }),
  );
  safeStorage.removeItem("standin.replay.withdrawn.v1");
  await clearReplayQueue();
  await persistWithdrawal(false);
  setInstallationCredentials({
    installationId: "private-replay-test",
    deviceToken: "fixture-only",
  });
  useLocalBodies.setState({ models: [], selected: {}, scroll: {} });
  useLocalImport.setState({ jobId: undefined, stage: "", error: "" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PersonalDeformLibrary />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: `${secret} 이름 변경` });
  await client.beginReplay("private-replay-test");
  const observed = vi.spyOn(client, "sendReplayEvents");
  const stop = startRecorder();
  try {
    fireEvent.click(screen.getByRole("button", { name: `${secret} 이름 변경` }));
    fireEvent.change(screen.getByRole("textbox", { name: "카드 이름" }), {
      target: { value: secret + "_EDIT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이름 변경 취소" }));
    fireEvent.click(screen.getByRole("button", { name: `${secret} 모습 확인` }));
    await screen.findByRole("dialog", { name: secret });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  } finally {
    stop();
  }
  expect(observed).toHaveBeenCalled();
  const recorded = observed.mock.calls.flatMap((call) => call[1]) as { type: number }[];
  expect(recorded.some((e) => e.type === 2)).toBe(true);
  expect(recorded.some((e) => e.type === 3)).toBe(true);
  expect(JSON.stringify(observed.mock.calls)).not.toContain(secret);
  // The same synchronous gate protects callers that submit local metadata directly.
  client.sendReplayEvents("app", [
    {
      type: 5,
      timestamp: Date.now(),
      data: {
        localModelId: "private-id",
        name: secret,
        sourcePath: "/Users/private/character.cs3c",
        sourceHash: "private-hash",
        contentBase64: "PRIVATE_BYTES",
      },
    },
  ]);
  await client.settleReplay();
  const queued = await queueItems();
  const chunks = queued.filter((q) => q.path.includes("/chunks/"));
  expect(chunks.length).toBeGreaterThan(0);
  for (const q of chunks) {
    const body = q.body as { data: string };
    const decoded = strFromU8(gunzipSync(Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0))));
    expect(decoded).not.toMatch(
      /PRIVATE_CHARACTER|private-id|private-hash|PRIVATE_BYTES|\/Users\/private|character\.cs3c/,
    );
  }
  const outbound = requests.filter(
    (body) => body && typeof body === "object" && "data" in body,
  ) as { data: string }[];
  expect(outbound.length).toBeGreaterThan(0);
  for (const body of outbound) {
    const decoded = strFromU8(gunzipSync(Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0))));
    expect(decoded).not.toMatch(
      /PRIVATE_CHARACTER|private-id|private-hash|PRIVATE_BYTES|\/Users\/private|character\.cs3c/,
    );
  }
  expect(JSON.stringify(requests)).not.toContain(secret);
  qc.clear();
  await clearReplayQueue();
});
