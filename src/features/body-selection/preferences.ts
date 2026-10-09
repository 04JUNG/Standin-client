import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { bodyKeys, getPreferences } from "./api";
import { useBodyOwner } from "./hooks";
export function useBodyPreferences() {
  const owner = useBodyOwner();
  return useQuery({
    queryKey: bodyKeys.preferences(owner),
    queryFn: ({ signal }) => getPreferences(signal),
    enabled: !!owner,
    retry: false,
  });
}
export function legacyPreferences(error: unknown) {
  return (
    error instanceof ApiError &&
    ([404, 501].includes(error.status) || error.code === "BODY_SELECTION_DISABLED")
  );
}
