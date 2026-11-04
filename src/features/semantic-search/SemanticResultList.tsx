import type { ComponentProps } from "react";
import { SemanticCandidateList } from "./SemanticCandidateList";
import { useSemanticPages } from "./useSemanticPages";
type Props<T> = ComponentProps<typeof SemanticCandidateList<T>> & {
  jobId?: string;
  lastGroup: boolean;
};
function Connected<T>({ jobId, lastGroup, ...props }: Props<T>) {
  const pages = useSemanticPages(jobId);
  return <SemanticCandidateList {...props} paged={!!pages} pages={lastGroup ? pages : undefined} />;
}
export function SemanticResultList<T>(props: Props<T>) {
  return props.jobId ? <Connected {...props} /> : <SemanticCandidateList {...props} />;
}
