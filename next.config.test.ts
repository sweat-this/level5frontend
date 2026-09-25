import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

// Regression coverage for issue #26's legacy compatibility redirects: the old generic-account
// challenges URLs must keep resolving to the namespaced Level 5 route, as a framework-level
// redirect (never a duplicate App Router page or a client-side redirect component).
describe("next.config redirects", () => {
  it("defines exactly the two legacy challenges redirects", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual([
      {
        source: "/account/challenges",
        destination: "/account/games/level5/challenges",
        permanent: false,
      },
      {
        source: "/account/challenges/:seriesId",
        destination: "/account/games/level5/challenges/:seriesId",
        permanent: false,
      },
    ]);
  });

  it("uses a temporary (307) redirect for both, not a permanent one", async () => {
    const redirects = await nextConfig.redirects?.();

    for (const entry of redirects ?? []) {
      expect(entry.permanent).toBe(false);
    }
  });
});
