"use client";

import ErrorFallback from "@/Components/ErrorFallback";

export default function Error(_props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback />;
}
