"use client";

import { useState } from "react";
import { Button, Stack, Typography } from "@mui/material";

type CopyStatus = "idle" | "success" | "error";

/**
 * Player Tag is immutable (issue #7) - this is the only interaction the profile page offers for
 * it. A small Client Component island so the rest of /account/profile can stay server-rendered
 * (issue #7's Server/Client Component boundary).
 */
export default function CopyTagButton({ tag }: { readonly tag: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(tag);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Button
        variant="outlined"
        size="small"
        onClick={handleCopy}
        aria-label={`Copy player tag ${tag}`}
      >
        Copy
      </Button>
      <Typography
        component="span"
        variant="body2"
        role="status"
        aria-live="polite"
        color={status === "error" ? "error" : "text.secondary"}
      >
        {status === "success" && "Copied."}
        {status === "error" && "Couldn't copy - please copy it manually."}
      </Typography>
    </Stack>
  );
}
