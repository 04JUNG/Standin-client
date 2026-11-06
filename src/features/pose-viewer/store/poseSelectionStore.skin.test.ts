import { beforeEach, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useInstallationStore } from "@/features/installation/installationStore";
import { saveConsentBinding } from "@/features/export/lib/saveBinding";
import { usePoseSelectionStore as store } from "./poseSelectionStore";

beforeEach(() => {
  store.getState().clearSelection();
  store.setState({ jobId: null });
});
it("keeps per-person skins without replacing pose, body, refinement or outline", () => {
  store.getState().startJob("skin-job", "male");
  store.getState().selectCandidate(0, "chosen-pose");
  store.getState().setPersonCharacter(0, "chosen-body");
  store.getState().setPersonOutline(0, 0.65);
  const before = store.getState();
  store.getState().setPersonSkin(0, "flesh-guide");
  store.getState().setPersonSkin(1, "muscle");
  const after = store.getState();
  expect(after.skinByPerson).toEqual({ 0: "flesh-guide", 1: "muscle" });
  expect(after.selectedByPerson).toBe(before.selectedByPerson);
  expect(after.characterByPerson).toBe(before.characterByPerson);
  expect(after.refineByPerson).toBe(before.refineByPerson);
  expect(after.outlineByPerson).toBe(before.outlineByPerson);
  store.getState().startJob("skin-job", "ignored");
  expect(store.getState().skinByPerson).toEqual(after.skinByPerson);
  store.getState().setJobId("different-job");
  expect(store.getState().skinByPerson).toEqual({});
});
it("revokes a ready save consent on skin change and removes default from choice identity", () => {
  const qc = new QueryClient();
  const original = saveConsentBinding(qc, "skin-job");
  store.getState().setPersonSkin(0, "gray-guide");
  expect(saveConsentBinding(qc, "skin-job")).not.toBe(original);
  store.getState().setPersonSkin(0, "default");
  expect(store.getState().skinByPerson).toEqual({});
  expect(saveConsentBinding(qc, "skin-job")).toBe(original);
});
it("rejects invalid indices/IDs and clears private choices on owner change", () => {
  store.getState().setPersonSkin(-1, "flesh");
  store.getState().setPersonSkin(0, "custom-url" as never);
  expect(store.getState().skinByPerson).toEqual({});
  store.getState().setPersonSkin(0, "flesh");
  useInstallationStore.setState({ credentials: undefined });
  useInstallationStore.setState({
    credentials: {
      installationId: "skin-owner",
      deviceToken: "fixture",
      consentVersion: "2026-08-02",
    },
  });
  expect(store.getState().skinByPerson).toEqual({});
});
