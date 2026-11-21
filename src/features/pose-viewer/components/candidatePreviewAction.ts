import { createContext, useContext } from "react";

export const PreviewContext = createContext<((candidateId: string) => void) | undefined>(undefined);
export function useCandidatePreview() {
  return useContext(PreviewContext);
}
