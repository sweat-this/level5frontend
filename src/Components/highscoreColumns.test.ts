import { describe, expect, it } from "vitest";
import { GridRenderCellParams } from "@mui/x-data-grid";
import highscoreColumns from "./highscoreColumns";
import { Mode } from "../constants/Enums";
import type { Highscore } from "../lib/backend-v1-public/types";

function renderCell(field: string, row: Partial<Highscore>): string {
  const column = highscoreColumns.find((c) => c.field === field);
  if (!column?.renderCell)
    throw new Error(`Column '${field}' has no renderCell`);
  // These particular columns' renderCell implementations always return a string - the field's
  // declared type is the broader GridColDef ReactNode signature.
  return column.renderCell({
    row,
  } as GridRenderCellParams<Highscore>) as string;
}

const baseRow: Partial<Highscore> = {
  modeid: Mode.VersusCpu,
  numPlayers: 4,
  p1IsCpu: 1,
  p2IsCpu: 1,
  p3IsCpu: 1,
  p4IsCpu: 1,
};

describe("highscoreColumns", () => {
  it("leaves the Vs column blank for non-versus-cpu modes", () => {
    expect(
      renderCell("p1IsCpu", { ...baseRow, modeid: Mode.TotalPoints }),
    ).toBe("");
  });

  it("reports the human player position out of the player count", () => {
    expect(renderCell("p1IsCpu", { ...baseRow, p2IsCpu: 0 })).toBe("2 of 4");
  });

  it("maps boolean-style flag columns to 'Yes'/'No'", () => {
    expect(renderCell("hardcoreEnabled", { hardcoreEnabled: 0 })).toBe("No");
    expect(renderCell("hardcoreEnabled", { hardcoreEnabled: 1 })).toBe("Yes");
  });
});
