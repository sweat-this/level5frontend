import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATIC_PUBLIC_ROUTES } from "./proxy";

// proxy.ts's STATIC_PUBLIC_ROUTES is a hand-maintained mirror of which routes Next actually
// renders statically - it has already drifted from reality twice (see that file's comment). This
// only has something to check after a real production build, so it's a no-op (not a failure)
// against a fresh checkout; wire `npm run build` before this suite in CI to make it count. Also
// run manually with `npm run build && npx vitest run src/proxy.static-routes.build.test.ts`.
const PRERENDER_MANIFEST_PATH = join(
  process.cwd(),
  ".next",
  "prerender-manifest.json",
);

// Next emits a handful of framework-internal pseudo-routes (error boundaries, not-found, etc.)
// alongside real page routes in the same manifest - these are never something a request's
// pathname can match, so they're irrelevant to STATIC_PUBLIC_ROUTES and must be filtered out
// rather than compared against it.
function isRealRoute(route: string): boolean {
  return !route.startsWith("/_");
}

describe.skipIf(!existsSync(PRERENDER_MANIFEST_PATH))(
  "STATIC_PUBLIC_ROUTES matches Next's actual static-route output",
  () => {
    it("has no route Next did not actually prerender as static, and is missing none that it did", () => {
      const manifest = JSON.parse(
        readFileSync(PRERENDER_MANIFEST_PATH, "utf8"),
      ) as { routes?: Record<string, unknown> };

      const actualStaticRoutes = Object.keys(manifest.routes ?? {})
        .filter(isRealRoute)
        .sort();

      expect(actualStaticRoutes).toEqual([...STATIC_PUBLIC_ROUTES].sort());
    });
  },
);
