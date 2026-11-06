import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { localBodyApi } from "./api";
import { useLocalBodies } from "./store";
export const localLibraryKey = ["personal-body-library"] as const;
export function useLocalLibrary() {
  const setModels = useLocalBodies((s) => s.setModels);
  const query = useQuery({
    queryKey: localLibraryKey,
    queryFn: localBodyApi.list,
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (query.data) setModels(query.data);
  }, [query.data, setModels]);
  return query;
}
