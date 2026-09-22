import { useQuery } from "@tanstack/react-query";
import apiFetch from "../httpClient";

export default function useCurrentVersion() {
  return useQuery({
    queryKey: ["application", "version", "current"],
    queryFn: () => apiFetch<string>("/api/application/version/current"),
  });
}
