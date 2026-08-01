import { QueryClient } from '@tanstack/react-query';

// Sane defaults for a read-only public dashboard: data doesn't need to be refetched just because
// the browser tab regained focus, and a short staleTime avoids re-fetching on every remount of a
// view while still picking up new scores/versions reasonably promptly.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default queryClient;
