import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression test for issue #8 section 28: friend/request rendering must use Backend V2's own
// FriendSummaryDto/FriendRequestListItemDto projections (playerId/displayName/tag/friendsSince,
// otherPlayer) directly - never one PlayersApi.getByTag() call per row to "decorate" a row with
// identity that Backend V2 already returned inline. A source-level assertion rather than a
// rendered-tree assertion: it is both a stronger and a more stable guarantee than trying to count
// fetch calls through a full Server Component render, and it fails loudly (naming the offending
// file) if anyone re-introduces a per-row lookup later.

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const FRIENDS_MODULE_FILES = [
  "./page.tsx",
  "./reads.ts",
  "./actions.ts",
  "./notices.ts",
  "./FriendRequestActionForm.tsx",
  "./RemoveFriendButton.tsx",
];

describe("friends portal - no N+1 player hydration", () => {
  it("never imports the Players resource client anywhere under account/friends", () => {
    for (const file of FRIENDS_MODULE_FILES) {
      const source = readSource(file);
      expect(source, `${file} must not import PlayersApi`).not.toMatch(
        /resources\/players/,
      );
      expect(source, `${file} must not call getByTag`).not.toMatch(/getByTag/);
    }
  });

  it("page.tsx reads each social list exactly once, via the typed Friends resource client", () => {
    const source = readSource("./page.tsx");

    expect(source).toContain("FriendsApi.listFriends(");
    expect(source).toContain("FriendsApi.listIncoming(");
    expect(source).toContain("FriendsApi.listOutgoing(");

    // Exactly one call site each - not inside a .map()/loop over rows.
    expect(source.match(/FriendsApi\.listFriends\(/g)).toHaveLength(1);
    expect(source.match(/FriendsApi\.listIncoming\(/g)).toHaveLength(1);
    expect(source.match(/FriendsApi\.listOutgoing\(/g)).toHaveLength(1);
  });

  it("row rendering reads otherPlayer/friend fields directly rather than looking them up", () => {
    const source = readSource("./page.tsx");

    expect(source).toContain("item.otherPlayer.displayName");
    expect(source).toContain("item.otherPlayer.tag");
    expect(source).toContain("friend.displayName");
    expect(source).toContain("friend.tag");
  });
});
