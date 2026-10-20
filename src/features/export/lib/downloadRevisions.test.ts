import { expect, it } from "vitest";
import {
  downloadBinding,
  downloadRevision,
  rememberDownload,
  revisionFileName,
} from "./downloadRevisions";
it("distinguishes new selections from re-downloading the same confirmed revision", () => {
  const source = (receipt: string, personIndex = 0) => ({
    personIndex,
    candidateId: "pose",
    downloadPath: `/v1/p?artifactReceipt=${receipt}`,
  });
  const a = downloadBinding("fbx", [source("a"), source("person2", 1)]);
  const b = downloadBinding("fbx", [source("b"), source("person2", 1)]);
  expect(downloadRevision("names-test", a)).toEqual({
    ordinal: 1,
    changed: false,
    repeated: false,
  });
  rememberDownload("names-test", a);
  expect(downloadRevision("names-test", b)).toEqual({ ordinal: 2, changed: true, repeated: false });
  rememberDownload("names-test", b);
  expect(downloadRevision("names-test", a)).toEqual({ ordinal: 1, changed: false, repeated: true });
  expect(downloadRevision("names-test", b).ordinal).toBe(2);
  expect(revisionFileName("장면_standin_pose.fbx", 1)).toBe("장면_standin_pose.fbx");
  expect(revisionFileName("장면_standin_pose.fbx", 2)).toBe("장면_standin_pose_v2.fbx");
  expect(downloadBinding("fbx", [source("person2", 1), source("b")])).toBe(b);
});
