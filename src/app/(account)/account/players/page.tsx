import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { firstQueryValue, type RawQueryValue } from "@/lib/search-params";
import { PLAYERS_PATH, resolvePlayerLookup } from "./lookup";
import SendFriendRequestForm from "./SendFriendRequestForm";

export const metadata: Metadata = {
  title: "Sweat This - Find Player",
  description: "Look up a Sweat This player by their exact Player Tag.",
};

export default async function PlayersLookupPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly tag?: RawQueryValue }>;
}) {
  const { tag: rawTag } = await searchParams;
  // Backend V2 owns tag normalization (issue #7) - trimming surrounding whitespace is the only
  // client-side adjustment made here, never uppercasing/parsing/partial matching. A repeated
  // `?tag=a&tag=b` deterministically resolves to the first occurrence.
  const tag = firstQueryValue(rawTag)?.trim();

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Find Player
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Search for a player by their exact Player Tag.
        </Typography>
      </Stack>

      <Stack
        component="form"
        action={PLAYERS_PATH}
        method="GET"
        direction="row"
        spacing={2}
      >
        <TextField
          id="players-tag"
          name="tag"
          label="Player Tag"
          required
          fullWidth
          defaultValue={tag ?? ""}
          slotProps={{ htmlInput: { maxLength: 64 } }}
        />
        <Button type="submit" variant="contained" sx={{ flexShrink: 0 }}>
          Search
        </Button>
      </Stack>

      {tag && <LookupResult tag={tag} />}
    </Stack>
  );
}

async function LookupResult({ tag }: { readonly tag: string }) {
  const outcome = await resolvePlayerLookup(tag);

  if (outcome.kind === "redirect") {
    redirect(outcome.path);
  }
  if (outcome.kind === "message") {
    return (
      <Alert severity="info" role="status">
        {outcome.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack
        spacing={1}
        component="dl"
        sx={{ margin: 0 }}
        aria-label="Search result"
      >
        <Stack direction="row" spacing={1}>
          <Typography component="dt" sx={{ fontWeight: "bold", margin: 0 }}>
            Display Name:
          </Typography>
          <Typography component="dd" sx={{ margin: 0 }}>
            {outcome.displayName}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Typography component="dt" sx={{ fontWeight: "bold", margin: 0 }}>
            Player Tag:
          </Typography>
          <Typography component="dd" sx={{ margin: 0 }}>
            {outcome.tag}
          </Typography>
        </Stack>
      </Stack>

      <SendFriendRequestForm
        tag={outcome.tag}
        displayName={outcome.displayName}
      />
    </Stack>
  );
}
