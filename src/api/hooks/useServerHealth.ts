import { useQuery } from "@tanstack/react-query";

const baseUrl = import.meta.env.VITE_API_BASE_URL;

// The backend's /health endpoint is a plain liveness probe (empty body, 200/503 status) rather
// than JSON, so this hits it directly instead of through apiFetch - which always tries to parse
// a JSON body and would throw on a non-2xx or empty response instead of reporting "unhealthy".
export default function useServerHealth() {
  return useQuery({
    queryKey: ["server", "health"],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/health`);
      return response.ok;
    },
  });
}
