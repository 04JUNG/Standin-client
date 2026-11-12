import { beforeEach, expect, it } from "vitest";
import { usePoseSelectionStore as store } from "./poseSelectionStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { QueryClient } from "@tanstack/react-query";
import { saveConsentBinding } from "@/features/export/lib/saveBinding";
beforeEach(() => {
  store.getState().clearSelection();
  store.setState({ jobId: null });
});
it("keeps widths per person across pose/body choice and app/bar remount, resets new jobs", () => {
  store.getState().startJob("outline-a", null);
  store.getState().setPersonOutline(0, 0.65);
  store.getState().setPersonOutline(1, 2);
  store.getState().selectCandidate(0, "another-pose");
  store.getState().setPersonCharacter(0, "another-body");
  store.getState().startJob("outline-a", "ignored");
  expect(store.getState().outlineByPerson).toEqual({ 0: 0.65, 1: 2 });
  store.getState().setJobId("outline-b");
  expect(store.getState().outlineByPerson).toEqual({});
});
it("revokes the current consent binding immediately, including gesture start", () => {
  const qc = new QueryClient();
  const first = saveConsentBinding(qc, "outline-job");
  store.getState().setPersonOutline(0, 1.2);
  expect(saveConsentBinding(qc, "outline-job")).not.toBe(first);
  store.getState().setPersonOutline(0, 0);
  expect(saveConsentBinding(qc, "outline-job")).toBe(first);
});
it("zero fully removes appearance and ownership change drops private widths", () => {
  store.getState().setPersonOutline(-1, 2);
  store.getState().setPersonOutline(0, Infinity);
  expect(store.getState().outlineByPerson).toEqual({});
  store.getState().setPersonOutline(0, 1);
  store.getState().setPersonOutline(0, 0);
  expect(store.getState().outlineByPerson).toEqual({});
  store.getState().setPersonOutline(1, 2);
  useInstallationStore.setState({ credentials: undefined });
  useInstallationStore.setState({
    credentials: {
      installationId: "outline-owner",
      deviceToken: "fixture",
      consentVersion: "2026-08-02",
    },
  });
  expect(store.getState().outlineByPerson).toEqual({});
});
