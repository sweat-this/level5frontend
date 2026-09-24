"use client";

import ErrorFallback from "@/Components/ErrorFallback";

export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback digest={error.digest} />;
}
