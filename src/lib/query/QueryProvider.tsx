"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Sane defaults for a read-only public dashboard: data doesn't need to be refetched just because
// the browser tab regained focus, and a short staleTime avoids re-fetching on every remount of a
// view while still picking up new scores/versions reasonably promptly.
//
// Constructed inside useState (not a module-level singleton) so this QueryClient only ever exists
// per-client-mount and is never a mutable object reachable from server-rendering code.
export default function QueryProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
