import { create } from "zustand";
import { sha256 } from "./encoding";
import { replayContext } from "./client";
export type SavedArtifact = {
  jobId: string;
  artifactHash: string;
  snapshotVersion: string;
  ordinal: number;
  owner: string;
};
export const useSavedArtifacts = create<{ items: SavedArtifact[] }>(() => ({ items: [] }));
let version = 0;
/** Call only after native save succeeds. No file path or source filename is retained. */
export async function rememberSavedArtifacts(
  jobId: string | undefined,
  format: string,
  files: { content: Uint8Array }[],
  selectionBinding: string,
) {
  const current = ++version;
  useSavedArtifacts.setState({ items: [] });
  const owner = replayContext()?.owner;
  if (!jobId || format !== "fbx" || !owner) return;
  const snapshotVersion = await sha256(new TextEncoder().encode(selectionBinding));
  const items = await Promise.all(
    files.map(async (file, ordinal) => ({
      jobId,
      owner,
      ordinal,
      snapshotVersion,
      artifactHash: await sha256(file.content),
    })),
  );
  if (current === version && replayContext()?.owner === owner)
    useSavedArtifacts.setState({ items });
}
