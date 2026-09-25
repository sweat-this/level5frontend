import type { ComponentType } from "react";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import OverviewPage, { metadata as overviewMetadata } from "./page";
import WorldPage, { metadata as worldMetadata } from "./world/page";
import CharactersPage, {
  metadata as charactersMetadata,
} from "./characters/page";

// Narrow regression (issue #24) - the public Secret Robot pages must not reveal or hint at any
// hidden/optional system tied to the Secret Robot name. This is not a general censorship
// framework: it only guards the specific reveal-adjacent phrases the issue calls out, against the
// specific pages this issue authors. If a future page legitimately needs one of these words in an
// unrelated, non-spoiler sense, narrow the assertion rather than deleting it.
const FORBIDDEN_PHRASES = [
  /controls murderlands/i,
  /controls the murder ?lands/i,
  /operates world infrastructure/i,
  /clearance detected/i,
  /good afternoon,? administrator/i,
  /master access/i,
  /clearance credential/i,
  /administrator progression/i,
];

const PAGES: ReadonlyArray<[string, ComponentType, Metadata]> = [
  ["/secret-robot", OverviewPage, overviewMetadata],
  ["/secret-robot/world", WorldPage, worldMetadata],
  ["/secret-robot/characters", CharactersPage, charactersMetadata],
];

describe("Secret Robot public pages - spoiler safety", () => {
  it.each(PAGES)(
    "%s does not contain hidden-reveal language",
    (_route, Page) => {
      const { container } = render(<Page />);
      const text = container.textContent ?? "";

      for (const phrase of FORBIDDEN_PHRASES) {
        expect(text).not.toMatch(phrase);
      }
    },
  );

  // Rendered body copy isn't the only public-facing surface - <title>/<meta description> (and
  // their openGraph/twitter mirrors) ship in the page's <head> and in social previews, but never
  // pass through render() in a Testing Library unit test, so the check above can't see them.
  it.each(PAGES)(
    "%s metadata does not contain hidden-reveal language",
    (_route, _Page, metadata) => {
      const fields = [
        metadata.title,
        metadata.description,
        metadata.openGraph && "title" in metadata.openGraph
          ? metadata.openGraph.title
          : undefined,
        metadata.openGraph?.description,
        metadata.twitter && "title" in metadata.twitter
          ? metadata.twitter.title
          : undefined,
        metadata.twitter?.description,
      ];

      for (const field of fields) {
        if (typeof field !== "string") continue;
        for (const phrase of FORBIDDEN_PHRASES) {
          expect(field).not.toMatch(phrase);
        }
      }
    },
  );
});
