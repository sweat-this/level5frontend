import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Modes from "./Modes";
import { MODE_CATALOG } from "./modeCatalog";

// Internal Unity vocabulary that must never leak into public mode-catalog content - GameModeId
// members, objective/clock/combat enum values, arena capability names, and the like. A static
// check against the catalog's own text, not a live cross-repository comparison (deliberately not
// a brittle cross-repository runtime test - see issue #23's test guidance).
const BANNED_INTERNAL_TERMS = [
  "GameModeId",
  "GameModeDefinition",
  "ContestCompletion",
  "LastPlayerStanding",
  "CampaignProgression",
  "MakeCount",
  "ConsecutiveShots",
  "BattleRoyal",
  "SevenPointLine",
  "Multiplayer",
  "level_0",
];

describe("modeCatalog", () => {
  it("contains no internal Unity object/enum names or numeric mode IDs", () => {
    const text = MODE_CATALOG.flatMap((category) => [
      category.title,
      ...category.modes.flatMap((mode) => [mode.name, mode.description]),
    ]).join(" ");

    for (const term of BANNED_INTERNAL_TERMS) {
      expect(text).not.toContain(term);
    }
  });
});

describe("Modes", () => {
  it("renders every authored public category as a heading", () => {
    render(<Modes />);

    for (const category of MODE_CATALOG) {
      expect(
        screen.getByRole("heading", { level: 2, name: category.title }),
      ).toBeInTheDocument();
    }
  });

  it("renders every authored mode name from the approved public catalog", () => {
    render(<Modes />);

    for (const category of MODE_CATALOG) {
      for (const mode of category.modes) {
        expect(
          screen.getByRole("heading", { level: 3, name: mode.name }),
        ).toBeInTheDocument();
      }
    }
  });

  it("renders exactly one h1", () => {
    render(<Modes />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
