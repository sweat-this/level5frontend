import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression test for issue #9's "Human-Readable Participant Identity" / "Performance" sections:
// list rows must render from SeriesSummaryDto's own inline challenger/opponent projections, and
// the detail page from exactly one getSeries call - never a PlayersApi lookup or a getSeries call
// per row. Source-level (like friends/no-n-plus-one.test.ts) rather than a rendered-tree
// assertion, so it fails loudly, naming the offending file, if a per-row hydration is ever
// reintroduced.

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const LIST_MODULE_FILES = [
  "./page.tsx",
  "./reads.ts",
  "./actions.ts",
  "./notices.ts",
  "./view.ts",
  "./ChallengeActionForm.tsx",
];

const DETAIL_MODULE_FILES = [
  "./[seriesId]/page.tsx",
  "./[seriesId]/reads.ts",
  "./[seriesId]/winner.ts",
];

describe("challenges portal - no N+1 player/series hydration", () => {
  it("never imports the Players resource client anywhere under account/challenges", () => {
    for (const file of [...LIST_MODULE_FILES, ...DETAIL_MODULE_FILES]) {
      const source = readSource(file);
      expect(source, `${file} must not import PlayersApi`).not.toMatch(
        /resources\/players/,
      );
      expect(source, `${file} must not call getByTag`).not.toMatch(/getByTag/);
      expect(
        source,
        `${file} must not call getMyPlayerId/getMyProfile`,
      ).not.toMatch(/getMy(PlayerId|Profile)/);
    }
  });

  it("the list page never calls SeriesApi.getSeries (no per-row detail hydration)", () => {
    const source = readSource("./page.tsx");
    expect(source).not.toMatch(/getSeries\(/);
  });

  it("page.tsx reads the selected category exactly once, via the typed Series resource client", () => {
    const source = readSource("./page.tsx");
    expect(source).toContain("resolveChallengesList(");
    expect(source.match(/resolveChallengesList\(/g)).toHaveLength(1);
  });

  it("reads.ts calls each list resource exactly once per function, not inside a loop", () => {
    const source = readSource("./reads.ts");
    for (const fn of [
      "listIncoming",
      "listOutgoing",
      "listActive",
      "listCompleted",
    ]) {
      expect(source).toContain(`SeriesApi.${fn}`);
    }
    // The whole module makes exactly one Backend V2 call: `list(accessToken, ...)`, dispatched to
    // one of the four functions via a lookup table - never a loop over list categories.
    expect(source).not.toMatch(/for\s*\(|\.map\(|\.forEach\(/);
  });

  it("row rendering reads challenger/opponent fields directly rather than looking them up", () => {
    const source = readSource("./page.tsx");
    expect(source).toContain("series.challenger.displayName");
    expect(source).toContain("series.challenger.tag");
    expect(source).toContain("series.opponent.displayName");
    expect(source).toContain("series.opponent.tag");
  });

  it("the detail page reads exactly one getSeries call", () => {
    const source = readSource("./[seriesId]/reads.ts");
    expect(source.match(/SeriesApi\.getSeries\(/g)).toHaveLength(1);
  });

  it("the detail page renders participant identity from the detail projection directly", () => {
    const source = readSource("./[seriesId]/page.tsx");
    expect(source).toContain("series.challenger.displayName");
    expect(source).toContain("series.challenger.tag");
    expect(source).toContain("series.opponent.displayName");
    expect(source).toContain("series.opponent.tag");
  });
});
