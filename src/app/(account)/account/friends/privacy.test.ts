import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Issue #8 section 24/27 "Privacy" coverage: the friends portal's only visible social identity is
// Display Name + Player Tag (+ Friends Since, for the friend list). This is a source-level
// regression guard alongside the (stronger, but harder to keep precise) TypeScript guarantee that
// FriendSummary/FriendRequestListItem/PublicPlayerSummary don't even carry AccountId/username/
// email/token fields - if a future contract change ever added one, this still catches it being
// carelessly rendered.

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

// Deliberately excludes "accessToken": passing the *caller's own* bearer token to an
// authenticated Backend V2 call (e.g. FriendsApi.listFriends(access.accessToken)) is required
// infrastructure, not a rendered social identity - what this guards against is a DTO's
// account-level field (AccountId/username/email) or a *token* ending up in JSX as visible text.
const FORBIDDEN_SUBSTRINGS = [
  "accountId",
  "AccountId",
  ".username",
  ".email",
  "refreshToken",
];

describe("friends portal - privacy", () => {
  it("page.tsx never references account/credential fields", () => {
    const source = readSource("./page.tsx");
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(source, `page.tsx must not reference ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("row components never reference account/credential fields", () => {
    for (const file of [
      "./RemoveFriendButton.tsx",
      "./FriendRequestActionForm.tsx",
    ]) {
      const source = readSource(file);
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(source, `${file} must not reference ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it("PlayerId only ever appears in non-visible positions (key/hidden form fields), never as rendered text", () => {
    const source = readSource("./page.tsx");
    // Every `.playerId` reference on this page is either a React `key`, a prop passed to
    // RemoveFriendButton (which itself never renders it as text - see RemoveFriendButton.tsx),
    // or absent entirely. None of them appear inside a <Typography> text child.
    const typographyChildrenWithPlayerId =
      /<Typography[^>]*>[^<]*\{[^}]*\.playerId[^}]*\}[^<]*<\/Typography>/;
    expect(source).not.toMatch(typographyChildrenWithPlayerId);
  });
});
